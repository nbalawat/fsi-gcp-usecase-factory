// Option B — workflow-first metaphor.
//
// Data layer is READ-ONLY: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. The adapters below are pure shape transforms (events
// bucketed BY STAGE) — no business logic, no math, no decisions.

import {
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
  BORROWERS,
  CANVAS_SHA256,
  CASE_SHAPE,
  COMPLIANCE_SCOPE,
  HITL_GATES,
  LIVE_CASE,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  PRIMARY_BORROWER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  type Borrower,
  type CaseShape,
} from "../../_shared/mock-data";

export {
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
  BORROWERS,
  CANVAS_SHA256,
  CASE_SHAPE,
  COMPLIANCE_SCOPE,
  HITL_GATES,
  LIVE_CASE,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  PRIMARY_BORROWER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
};

export type { Borrower, CaseShape };

// Type the events strictly — no `any` leaks out.
export interface RawEvt {
  at: string;
  kind: string;
  stage?: string;
  doc_type?: string;
  service?: string;
  agent?: string;
  gate?: string;
  decision?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  confidence?: number;
}

// ─── stage state ─────────────────────────────────────────────────────────
// Each stage in CASE_SHAPE.stages becomes one StageBucket. A bucket holds
// every event that fell INTO that stage (i.e., between the matching
// `stage_entered` event and the next `stage_entered` event). Pure shape
// transform — no business decisions.

export type StageStatus = "done" | "active" | "queued";

export interface StageBucket {
  id: string;
  /** banker-readable label */
  label: string;
  /** "done" if a later stage was entered; "active" if it's the current
   *  stage; "queued" if it hasn't been entered yet. */
  status: StageStatus;
  /** ISO timestamp when this stage was entered (if it has been). */
  enteredAt?: string;
  /** Events that fired while this stage was active. */
  events: RawEvt[];
  /** Index of this stage in CASE_SHAPE.stages — drives ordering. */
  idx: number;
}

const STAGE_LABEL: Record<string, string> = {
  intake: "Intake",
  extracting: "Extracting",
  analyzing: "Analyzing",
  spreading: "Spreading",
  rating: "Rating",
  drafting: "Drafting",
  reviewing: "Reviewing",
  approval: "Approval",
  done: "Done",
};

const HITL_LABEL: Record<string, string> = {
  extraction_review: "Extraction review",
  rating_review: "Rating review",
  draft_review: "Draft review",
  final_approval: "Final approval",
};

export function stageLabel(id: string): string {
  return STAGE_LABEL[id] ?? id;
}

export function hitlLabel(id: string): string {
  return HITL_LABEL[id] ?? id;
}

/**
 * Bucket the event stream BY STAGE. The event log is the ground truth:
 * we walk it once, attaching each non-stage event to whichever stage is
 * currently "open" (last `stage_entered`).
 *
 * Stages that never appear in the event log are returned as `queued`.
 */
export function bucketByStage(
  events: readonly RawEvt[],
  stages: readonly string[],
  currentStage: string,
): StageBucket[] {
  const buckets: Record<string, StageBucket> = {};
  stages.forEach((s, idx) => {
    buckets[s] = {
      id: s,
      label: stageLabel(s),
      status: "queued",
      events: [],
      idx,
    };
  });

  let openStage: string | undefined;
  for (const e of events) {
    if (e.kind === "stage_entered" && e.stage) {
      if (buckets[e.stage]) {
        buckets[e.stage].enteredAt = e.at;
      }
      openStage = e.stage;
      continue;
    }
    if (openStage && buckets[openStage]) {
      buckets[openStage].events.push(e);
    }
  }

  // Derive status from enteredAt + currentStage:
  //  - entered AND not the current → done
  //  - entered AND is the current → active
  //  - not entered → queued
  const currentIdx = stages.indexOf(currentStage);
  return stages.map((s, idx) => {
    const b = buckets[s];
    if (b.enteredAt) {
      if (s === currentStage) b.status = "active";
      else if (idx < currentIdx) b.status = "done";
      else b.status = "done"; // entered & past — still done from a layout POV
    } else {
      // Not entered. If the stage's index is BEFORE currentIdx the spine
      // never visited it — treat as queued (could happen with skipped
      // stages); if it's after, also queued.
      b.status = "queued";
    }
    return b;
  });
}

// ─── per-bucket summary (counts only — no math) ─────────────────────────

export interface StageSummary {
  serviceCalls: number;
  agentCalls: number;
  humanActions: number;
  pendingGates: number;
  totalEvents: number;
}

export function summariseBucket(b: StageBucket): StageSummary {
  let serviceCalls = 0;
  let agentCalls = 0;
  let humanActions = 0;
  let pendingGates = 0;
  for (const e of b.events) {
    if (e.kind === "service_invoked" || e.kind === "document_extracted")
      serviceCalls += 1;
    if (e.kind === "agent_invoked") agentCalls += 1;
    if (e.kind === "human_action") humanActions += 1;
    if (e.kind === "human_action_pending") pendingGates += 1;
  }
  return {
    serviceCalls,
    agentCalls,
    humanActions,
    pendingGates,
    totalEvents: b.events.length,
  };
}

// ─── HITL gate state (derived from events, no business logic) ───────────

export interface GateState {
  id: string;
  label: string;
  status: "completed" | "pending" | "queued";
  decision?: string;
  decidedAt?: string;
}

export function gateStates(
  events: readonly RawEvt[],
  hitlGates: readonly string[],
): GateState[] {
  return hitlGates.map((g) => {
    const pendingEvt = events.find(
      (e) => e.kind === "human_action_pending" && e.gate === g,
    );
    const completedEvt = events.find(
      (e) => e.kind === "human_action" && e.gate === g,
    );
    if (completedEvt) {
      return {
        id: g,
        label: hitlLabel(g),
        status: "completed" as const,
        decision: completedEvt.decision,
        decidedAt: completedEvt.at,
      };
    }
    if (pendingEvt) {
      return {
        id: g,
        label: hitlLabel(g),
        status: "pending" as const,
      };
    }
    return { id: g, label: hitlLabel(g), status: "queued" as const };
  });
}

// ─── case lookup ─────────────────────────────────────────────────────────

export interface CaseRecord {
  id: string;
  title: string;
  borrower: Borrower;
  current_stage: string;
  decision: string;
  decision_kind: string;
  hitl_gates: readonly string[];
  rule_verdicts: Record<string, "pass" | "watch" | "fail" | "skip">;
  events: readonly RawEvt[];
}

/**
 * Look up a case by canonical id. The mock data ships a single live case;
 * any id resolves to it (the param is preserved verbatim so the URL
 * stays meaningful).
 */
export function getCase(id: string): CaseRecord {
  return {
    id: id || LIVE_CASE.id,
    title: LIVE_CASE.title,
    borrower: LIVE_CASE.borrower,
    current_stage: LIVE_CASE.current_stage,
    decision: LIVE_CASE.decision,
    decision_kind: LIVE_CASE.decision_kind,
    hitl_gates: LIVE_CASE.hitl_gates,
    rule_verdicts: LIVE_CASE.rule_verdicts,
    events: LIVE_CASE.events as readonly RawEvt[],
  };
}

// ─── ProcessStep shape — feeds the shared PipelineMini primitive ───────
// The shared PipelineMini wants ProcessStep-shaped items. We synthesise
// them from the canvas's 5-step paradigm (handler → atomic → rules →
// agent → sinks). Status is read straight from `current_stage`: any
// stage past "intake" implies handler is done; any past "extracting"
// implies atomic is done; etc. No threshold math.

export type ParadigmStepKind =
  | "source"
  | "handler"
  | "atomic-services"
  | "rules"
  | "agent"
  | "sinks";

export interface ParadigmStep {
  kind: ParadigmStepKind;
  label: string;
  status: "done" | "active" | "pending" | "error";
  parallelism?: number;
  actors?: string[];
  latencyMs?: number;
  note?: string;
}

export function paradigmSteps(c: CaseRecord): ParadigmStep[] {
  const stageIdx = CASE_SHAPE.stages.indexOf(c.current_stage);
  const past = (i: number): "done" | "active" | "pending" =>
    stageIdx > i ? "done" : stageIdx === i ? "active" : "pending";

  return [
    { kind: "source", label: "PIPELINE_EVENT", status: past(0), note: c.id },
    {
      kind: "handler",
      label: "intake-handler",
      status: past(0),
      parallelism: 1,
      actors: ["intake-handler"],
    },
    {
      kind: "atomic-services",
      label: "atomic services",
      status: past(2),
      parallelism: 6,
      actors: [
        "financial-spreader",
        "loan-serviceability",
        "peer-and-industry-context",
        "borrower-network",
        "collateral-valuator",
        "document-extractor",
      ],
    },
    {
      kind: "rules",
      label: "rules engine",
      status: past(4),
      parallelism: SHARED_RULES.length,
      actors: SHARED_RULES,
    },
    {
      kind: "agent",
      label: "agent orchestration",
      status: past(5),
      parallelism: 5,
      actors: [
        "document-processor",
        "analyst-multisection",
        "rater-with-covenant",
        "narrative-drafter",
        "memo-reviewer-v2",
      ],
    },
    {
      kind: "sinks",
      label: "sinks",
      status: past(7),
      parallelism: 2,
      actors: ["memo-archive", "decision-ledger"],
    },
  ];
}

// ─── AgentChain feed (shared primitive) ─────────────────────────────────
// AgentNode shape, status drawn from the event log. Pure read.

export type AgentNodeStatus = "idle" | "running" | "done" | "blocked" | "error";

export interface AgentNode {
  id: string;
  role: string;
  status: AgentNodeStatus;
  model?: string;
  message?: string;
  confidence?: number;
  latencyMs?: number;
  toolsUsed?: string[];
}

export function agentNodes(events: readonly RawEvt[]): AgentNode[] {
  const agents = [
    "document-processor",
    "analyst-multisection",
    "rater-with-covenant",
    "narrative-drafter",
    "memo-reviewer-v2",
  ];
  return agents.map((a) => {
    const evt = events.find((e) => e.kind === "agent_invoked" && e.agent === a);
    const status: AgentNodeStatus = evt ? "done" : "idle";
    return {
      id: a,
      role: a,
      status,
      model:
        MODEL_PROVIDER === "hybrid"
          ? a === "narrative-drafter" || a === "analyst-multisection"
            ? "claude-opus-4-7"
            : "gemini-3-1-flash"
          : undefined,
      latencyMs: undefined,
    };
  });
}
