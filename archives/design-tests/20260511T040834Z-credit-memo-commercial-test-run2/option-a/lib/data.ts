// Option A — sparse-executive view.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. Adapters BELOW the re-export bar are pure shape
// transforms (event → gate state, event → signal line) — no business
// logic, no math.

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

// ─── raw event shape (mirrors the generated mock) ────────────────────────
interface RawEvt {
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

// ─── case record (sparse — only what the exec view renders) ──────────────

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
 * Look up a case by canonical id. The mock data ships a single live
 * case; any id resolves to it (the param is preserved so the URL stays
 * meaningful and the page header shows the right borrower).
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

// ─── HITL gate state derived from events (no business logic — pure read) ─

const HITL_LABEL: Record<string, string> = {
  extraction_review: "Extraction",
  rating_review: "Rating",
  draft_review: "Draft",
  final_approval: "Final",
};

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

// ─── signal line — the one-line "why" an exec needs ──────────────────────
// Pure derivation: count rule verdicts and stage progression. No
// thresholds checked, no values computed beyond a tally.

export interface SignalSnapshot {
  rulesPass: number;
  rulesWatch: number;
  rulesFail: number;
  rulesTotal: number;
  agentReasonings: number;
  serviceCalls: number;
  gatesDecided: number;
  gatesTotal: number;
}

export function signalSnapshot(c: CaseRecord): SignalSnapshot {
  let rulesPass = 0;
  let rulesWatch = 0;
  let rulesFail = 0;
  for (const r of Object.keys(c.rule_verdicts)) {
    const v = c.rule_verdicts[r];
    if (v === "pass") rulesPass += 1;
    if (v === "watch") rulesWatch += 1;
    if (v === "fail") rulesFail += 1;
  }
  let agentReasonings = 0;
  let serviceCalls = 0;
  let gatesDecided = 0;
  for (const e of c.events) {
    if (e.kind === "agent_invoked") agentReasonings += 1;
    if (e.kind === "service_invoked") serviceCalls += 1;
    if (e.kind === "human_action") gatesDecided += 1;
  }
  return {
    rulesPass,
    rulesWatch,
    rulesFail,
    rulesTotal: Object.keys(c.rule_verdicts).length,
    agentReasonings,
    serviceCalls,
    gatesDecided,
    gatesTotal: c.hitl_gates.length,
  };
}

// ─── workflow stage map (for the thin top rail) ──────────────────────────
// Drop a Stage[] for the shared <WorkflowStageRail> primitive. Every
// stage from CASE_SHAPE.stages gets a row; count = 1 (live case is a
// singleton in mock data).

export interface RailStage {
  id: string;
  name: string;
  type: "agent" | "human" | "mixed" | "auto";
  count: number;
}

const STAGE_TYPE: Record<string, "agent" | "human" | "mixed" | "auto"> = {
  intake: "human",
  extracting: "agent",
  analyzing: "agent",
  spreading: "auto",
  rating: "agent",
  drafting: "agent",
  reviewing: "human",
  approval: "human",
  done: "auto",
};

export function railStages(c: CaseRecord): RailStage[] {
  return CASE_SHAPE.stages.map((s) => ({
    id: s,
    name: s,
    type: STAGE_TYPE[s] ?? "auto",
    count: 1,
  }));
}
