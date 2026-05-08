/**
 * Derives ProcessFlow steps + AgentChain agents from a CaseRecord.
 *
 * The mapping follows the credit-memo pipeline:
 *   loans.application.submitted (source)
 *     → handler (enrich)
 *     → atomic services (8 parallel: financial-spreader, dscr-calculator, …)
 *     → rules-service (regulatory + eligibility + approval-matrix)
 *     → ADK agent (supervisor + extractor → rater → drafter)
 *     → sinks (gl-posting + document-store-gcs)
 *
 * Stage names from the case are used to set per-step `status`.
 */

import type {
  AgentNode,
  ProcessStep,
  StepStatus,
} from "@fsi-bank/components";
import type { CaseRecord } from "./types";

const ATOMIC_SERVICES = [
  "financial-spreader",
  "dscr-calculator",
  "covenant-analyzer",
  "peer-benchmarker",
  "industry-risk-scorer",
  "collateral-valuator",
  "exposure-aggregator",
  "insider-screening",
];

const RULES = [
  "regulatory_thresholds",
  "single_borrower_exposure",
  "approval_matrix_commercial",
  "credit-memo-eligibility",
];

const SINKS = ["gl-posting", "document-store-gcs"];

/** Stage → which step is currently active. */
const stageToActiveStep: Record<string, ProcessStep["kind"]> = {
  intake: "handler",
  enrich: "handler",
  spreading: "atomic-services",
  scoring: "rules",
  underwrite: "agent",
  approval: "agent",
  decision: "agent",
  posting: "sinks",
  done: "sinks",
};

const stepOrder: ProcessStep["kind"][] = [
  "source",
  "handler",
  "atomic-services",
  "rules",
  "agent",
  "sinks",
];

const compareSteps = (
  a: ProcessStep["kind"],
  b: ProcessStep["kind"],
): number => stepOrder.indexOf(a) - stepOrder.indexOf(b);

/** Build a per-case ProcessFlow. */
export function buildProcessFlow(c: CaseRecord): ProcessStep[] {
  const active: ProcessStep["kind"] =
    stageToActiveStep[c.stage] ?? "handler";

  const isStuck = !!c.stuck;

  const stepStatus = (kind: ProcessStep["kind"]): StepStatus => {
    if (isStuck && kind === active) return "error";
    const cmp = compareSteps(kind, active);
    if (cmp < 0) return "done";
    if (cmp === 0) return c.decision === "STALLED" ? "error" : "active";
    return "pending";
  };

  return [
    {
      kind: "source",
      label: "loans.application.submitted",
      status: stepStatus("source"),
      note: `${c.application_id} · $${(c.loan_amount_usd / 1_000_000).toFixed(1)}M`,
    },
    {
      kind: "handler",
      label: "Handler",
      status: stepStatus("handler"),
      latencyMs: stepStatus("handler") === "done" ? 87 : undefined,
      actors: ["fsi-handler-credit-memo-commercial"],
      note:
        stepStatus("handler") === "done"
          ? "Enriched with borrower master + uploaded statements"
          : undefined,
    },
    {
      kind: "atomic-services",
      label: "Atomic services",
      status: stepStatus("atomic-services"),
      parallelism: ATOMIC_SERVICES.length,
      actors: ATOMIC_SERVICES,
      note:
        c.dscr_base !== undefined
          ? `DSCR ${c.dscr_base.toFixed(2)} · risk band ${c.risk_band}`
          : undefined,
    },
    {
      kind: "rules",
      label: "Rules engine (Zen JDM)",
      status: stepStatus("rules"),
      actors: RULES,
      note:
        c.single_borrower_pct !== undefined
          ? `single-borrower ${(c.single_borrower_pct * 100).toFixed(2)}%`
          : undefined,
    },
    {
      kind: "agent",
      label: "ADK agent",
      status: stepStatus("agent"),
      actors: ["supervisor", "extractor", "rater", "drafter"],
      note: c.rationale_summary,
    },
    {
      kind: "sinks",
      label: "Sinks",
      status: stepStatus("sinks"),
      parallelism: SINKS.length,
      actors: SINKS,
      note:
        stepStatus("sinks") === "done"
          ? "Memo written to GCS · GL posting recorded"
          : undefined,
    },
  ];
}

/** Build the AgentChain for a single case. */
export function buildAgentChain(c: CaseRecord): AgentNode[] {
  const active = stageToActiveStep[c.stage] ?? "handler";
  const reachedAgent =
    compareSteps("agent", active) <= 0 || c.stage === "underwrite";

  // Each specialist runs in sequence under the supervisor.
  const stalled = c.stuck === true;

  const extractor: AgentNode = {
    id: "extractor",
    role: "extractor",
    model: "claude-opus-4-7",
    status: stalled
      ? "error"
      : reachedAgent
        ? "done"
        : compareSteps("agent", active) === 0
          ? "running"
          : "idle",
    confidence: reachedAgent && !stalled ? 0.94 : undefined,
    latencyMs: reachedAgent && !stalled ? 8420 : undefined,
    message: stalled
      ? "Document extraction timed out · retries exhausted"
      : "Parsed 10-K + interim financials → 47 spreading fields",
    toolsUsed: ["document-ai", "financial-spreader"],
    memoryScope: "borrower",
  };

  const rater: AgentNode = {
    id: "rater",
    role: "rater",
    model: "claude-opus-4-7",
    status: stalled
      ? "blocked"
      : reachedAgent && c.decision !== "STALLED"
        ? "done"
        : "idle",
    confidence: c.agent_confidence,
    latencyMs: !stalled && reachedAgent ? 5210 : undefined,
    message: stalled
      ? "Waiting on extractor"
      : `Risk rating ${c.risk_band} · ${c.reasoning_factors?.length ?? 0} factors`,
    toolsUsed: ["industry-risk-scorer", "peer-benchmarker", "covenant-analyzer"],
    memoryScope: "borrower",
  };

  const drafter: AgentNode = {
    id: "drafter",
    role: "drafter",
    model: "claude-opus-4-7",
    status: stalled
      ? "idle"
      : c.stage === "approval" || c.stage === "decision" || c.stage === "done"
        ? "done"
        : compareSteps("agent", active) === 0
          ? "running"
          : "idle",
    confidence: c.citation_density !== undefined ? c.citation_density : undefined,
    latencyMs: c.citation_density !== undefined ? 14210 : undefined,
    message: stalled
      ? "Cannot draft — extractor blocked"
      : c.citation_density !== undefined
        ? `Memo drafted · citation density ${(c.citation_density * 100).toFixed(0)}%`
        : "Awaiting rater output",
    toolsUsed: ["document-store-gcs"],
    memoryScope: "borrower",
  };

  return [extractor, rater, drafter];
}

export function buildSupervisor(c: CaseRecord): AgentNode {
  const active = stageToActiveStep[c.stage] ?? "handler";
  const stalled = c.stuck === true;
  const inAgent = active === "agent" || compareSteps("agent", active) < 0;

  return {
    id: "supervisor",
    role: "credit_memo_supervisor",
    model: "claude-opus-4-7",
    status: stalled ? "error" : inAgent ? "running" : "idle",
    message: stalled
      ? c.alert ?? "Pipeline stall — escalation pending"
      : inAgent
        ? "Coordinating extractor → rater → drafter for credit memo"
        : "Waiting on upstream services",
    memoryScope: "borrower",
  };
}
