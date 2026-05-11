// Option A — sparse-executive view of SAR investigations.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. Adapters BELOW the re-export bar are pure shape
// transforms (event → headline) — no business logic, no math beyond
// counting events and picking the latest one of a kind.

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

// ─── raw event shape (typed strictly so adapters cannot leak `any`) ──────
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

// ─── case lookup (param preserved verbatim) ──────────────────────────────

export interface SarCaseRecord {
  id: string;
  title: string;
  borrower: Borrower;
  current_stage: string;
  /** The case's terminal decision: file_sar | dismiss | escalate */
  decision: string;
  decision_kind: string;
  hitl_gates: readonly string[];
  rule_verdicts: Record<string, "pass" | "watch" | "fail" | "skip">;
  events: readonly RawEvt[];
  /** When the alert was opened (ISO) — derived from the first event */
  alertedAt: string;
  /** SAR filing deadline (ISO) — alertedAt + 30 days */
  sarDeadline: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function deriveAlertedAt(events: readonly RawEvt[]): string {
  const first = events[0];
  if (!first) return new Date().toISOString();
  return first.at;
}

function deriveSarDeadline(alertedAt: string): string {
  return new Date(new Date(alertedAt).getTime() + THIRTY_DAYS_MS).toISOString();
}

/**
 * Look up a case by canonical id. The mock data ships a single live case;
 * any id resolves to it (the param is preserved verbatim so the URL
 * stays meaningful).
 */
export function getCase(id: string): SarCaseRecord {
  const events = LIVE_CASE.events as readonly RawEvt[];
  const alertedAt = deriveAlertedAt(events);
  return {
    id: id || LIVE_CASE.id,
    title: LIVE_CASE.title,
    borrower: LIVE_CASE.borrower,
    current_stage: LIVE_CASE.current_stage,
    // SAR-specific decision vocabulary. The shared mock data ships
    // `approve` as the demo final disposition; for SAR sparse-executive
    // we surface it as `file_sar` per the use-case decision_kind.
    decision: LIVE_CASE.decision === "approve" ? "file_sar" : LIVE_CASE.decision,
    decision_kind: LIVE_CASE.decision_kind,
    hitl_gates: LIVE_CASE.hitl_gates,
    rule_verdicts: LIVE_CASE.rule_verdicts,
    events,
    alertedAt,
    sarDeadline: deriveSarDeadline(alertedAt),
  };
}

// ─── derived summary counts (pure read) ──────────────────────────────────

export interface CaseSummary {
  totalEvents: number;
  agentCalls: number;
  serviceCalls: number;
  gatesDecided: number;
  gatesTotal: number;
}

export function summarizeCase(c: SarCaseRecord): CaseSummary {
  let agentCalls = 0;
  let serviceCalls = 0;
  let gatesDecided = 0;
  for (const e of c.events) {
    if (e.kind === "agent_invoked") agentCalls += 1;
    if (e.kind === "service_invoked") serviceCalls += 1;
    if (e.kind === "human_action") gatesDecided += 1;
  }
  return {
    totalEvents: c.events.length,
    agentCalls,
    serviceCalls,
    gatesDecided,
    gatesTotal: c.hitl_gates.length,
  };
}

// ─── the ONE alert reason — sparse-executive core ────────────────────────
//
// The sparse-executive view shows exactly one alert reason that explains
// why this case is on the BSA Officer's queue. We pick it from the
// pipeline events deterministically:
//   1. Prefer the LAST agent_invoked output (the regulatory-narrator's
//      reasoning is the closest thing to a banker-readable headline).
//   2. Otherwise fall back to the canvas's first key_metric.

export interface AlertReason {
  /** One-line headline, banker vocabulary */
  headline: string;
  /** One-line supporting detail */
  detail: string;
  /** Which agent or service produced this signal */
  attribution: string;
}

const AGENT_HEADLINES: Record<string, { headline: string; detail: string }> = {
  "complaint-categorizer": {
    headline: "Velocity-spike + structuring signal categorised as suspicious",
    detail:
      "Wire-out aggregation across 14 days matches structuring pattern; complaint-categorizer flagged at HIGH confidence.",
  },
  "insider-screener": {
    headline: "No insider linkage on this counterparty",
    detail:
      "insider-screener confirmed Reg O / single-borrower aggregates are within limits for this case.",
  },
  "regulatory-narrator": {
    headline: "BSA narrative supports a SAR filing",
    detail:
      "regulatory-narrator drafted the Section 5 narrative; structuring_signal_threshold breached on day 9.",
  },
  "narrative-drafter": {
    headline: "SAR narrative ready for officer review",
    detail:
      "narrative-drafter produced the regulator-ready narrative; all upstream signals corroborated.",
  },
};

export function pickAlertReason(c: SarCaseRecord): AlertReason {
  // Walk events in reverse — the latest agent_invoked wins.
  for (let i = c.events.length - 1; i >= 0; i -= 1) {
    const e = c.events[i];
    if (e.kind === "agent_invoked" && e.agent) {
      const lookup = AGENT_HEADLINES[e.agent];
      if (lookup) {
        return {
          headline: lookup.headline,
          detail: lookup.detail,
          attribution: e.agent,
        };
      }
      return {
        headline: `${e.agent} reasoning complete`,
        detail: "See agent reasoning for the full chain of evidence.",
        attribution: e.agent,
      };
    }
  }
  // Fallback: first canvas key_metric.
  const km = CASE_SHAPE.key_metrics[0] ?? "alert_score";
  return {
    headline: `Alert raised on ${km}`,
    detail: "No agent reasoning has been recorded yet on this case.",
    attribution: "pipeline",
  };
}

// ─── HITL gate state derived from events (no business logic — pure read) ─

export interface GateState {
  id: string;
  label: string;
  status: "completed" | "pending" | "queued";
  decision?: string;
  decidedAt?: string;
}

const HITL_LABEL: Record<string, string> = {
  final_approval: "BSA Officer signoff",
};

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
        label: HITL_LABEL[g] ?? g,
        status: "completed" as const,
        decision: completedEvt.decision,
        decidedAt: completedEvt.at,
      };
    }
    if (pendingEvt) {
      return {
        id: g,
        label: HITL_LABEL[g] ?? g,
        status: "pending" as const,
      };
    }
    return { id: g, label: HITL_LABEL[g] ?? g, status: "queued" as const };
  });
}

// ─── activity feed (compressed, right-rail) ──────────────────────────────
// Sparse-executive: the activity feed is intentionally short — only the
// distinct kinds of work that have occurred, each with the latest
// timestamp. No per-event log; that lives in the (out-of-scope) detail
// view.

export interface ActivityLine {
  kind: "service" | "agent" | "rule" | "gate";
  label: string;
  ref: string;
  at: string;
}

export function activityFeed(c: SarCaseRecord): ActivityLine[] {
  const lines: ActivityLine[] = [];
  const seenAgents = new Set<string>();
  const seenServices = new Set<string>();
  for (const e of c.events) {
    if (e.kind === "service_invoked" && e.service && !seenServices.has(e.service)) {
      seenServices.add(e.service);
      lines.push({ kind: "service", label: e.service, ref: e.service, at: e.at });
    }
    if (e.kind === "agent_invoked" && e.agent && !seenAgents.has(e.agent)) {
      seenAgents.add(e.agent);
      lines.push({ kind: "agent", label: e.agent, ref: e.agent, at: e.at });
    }
  }
  return lines;
}
