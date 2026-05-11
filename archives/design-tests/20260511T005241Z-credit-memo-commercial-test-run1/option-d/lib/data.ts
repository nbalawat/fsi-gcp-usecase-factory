// Option D — wildcard "conversation timeline" view.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. Adapters BELOW the re-export bar are pure shape
// transforms (event → transcript row) — no business logic, no math.

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

// ─── transcript row shape ────────────────────────────────────────────────
// A transcript row is one entry in the case's chat-style log. Every event
// in PIPELINE_EVENTS becomes exactly one row. No event is dropped, no
// event is invented. Order = event order.

export type TranscriptActor =
  | "system"
  | "service"
  | "agent"
  | "human"
  | "gate";

export interface TranscriptRow {
  /** Index in PIPELINE_EVENTS — stable key */
  idx: number;
  at: string;
  actor: TranscriptActor;
  /** Banker-readable speaker handle, e.g. "narrative-drafter", "Risk Officer" */
  speaker: string;
  /** Banker-readable headline of what happened */
  headline: string;
  /** Optional one-line detail */
  detail?: string;
  /** Optional gate id (only present for HITL rows) */
  gate?: string;
  /** Optional decision verb (approve / return / reject) for completed HITL rows */
  decision?: string;
  /** Optional service / agent id for drill-in */
  ref?: string;
  /** Tokens / latency, when the underlying event carries them */
  meta?: { latencyMs?: number; tokensIn?: number; tokensOut?: number; confidence?: number };
}

const HITL_LABEL: Record<string, string> = {
  extraction_review: "Extraction review",
  rating_review: "Rating review",
  draft_review: "Draft review",
  final_approval: "Final approval",
};

// Type the events array so the adapter is strict — no `any` leaks out.
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

export function toTranscript(events: readonly RawEvt[]): TranscriptRow[] {
  return events.map((e, idx) => {
    const base = { idx, at: e.at };
    switch (e.kind) {
      case "stage_entered":
        return {
          ...base,
          actor: "system" as const,
          speaker: "pipeline",
          headline: `Entered stage "${e.stage}"`,
        };
      case "document_uploaded":
        return {
          ...base,
          actor: "human" as const,
          speaker: CASE_SHAPE.primary_actor,
          headline: `Uploaded ${e.doc_type}`,
        };
      case "document_extracted":
        return {
          ...base,
          actor: "service" as const,
          speaker: "document-extractor",
          headline: `Extracted ${e.doc_type}`,
          ref: "document-extractor",
          meta: { confidence: e.confidence },
        };
      case "service_invoked":
        return {
          ...base,
          actor: "service" as const,
          speaker: e.service ?? "service",
          headline: `Ran ${e.service}`,
          ref: e.service,
          meta: { latencyMs: e.latency_ms },
        };
      case "agent_invoked":
        return {
          ...base,
          actor: "agent" as const,
          speaker: e.agent ?? "agent",
          headline: `${e.agent} reasoned`,
          ref: e.agent,
          meta: { tokensIn: e.tokens_in, tokensOut: e.tokens_out },
        };
      case "human_action_pending":
        return {
          ...base,
          actor: "gate" as const,
          speaker: HITL_LABEL[e.gate ?? ""] ?? e.gate ?? "gate",
          headline: `${HITL_LABEL[e.gate ?? ""] ?? e.gate} requested`,
          detail: "Awaiting reviewer disposition",
          gate: e.gate,
        };
      case "human_action":
        return {
          ...base,
          actor: "human" as const,
          speaker: HITL_LABEL[e.gate ?? ""] ?? e.gate ?? "reviewer",
          headline: `${HITL_LABEL[e.gate ?? ""] ?? e.gate} → ${e.decision}`,
          gate: e.gate,
          decision: e.decision,
        };
      default:
        return {
          ...base,
          actor: "system" as const,
          speaker: "pipeline",
          headline: e.kind,
        };
    }
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
 * stays meaningful and the transcript shows the right borrower).
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

// ─── transcript filters ──────────────────────────────────────────────────

export type TranscriptFilter = "all" | "agent" | "human" | "service" | "gate";

export function filterTranscript(
  rows: readonly TranscriptRow[],
  filter: TranscriptFilter,
): TranscriptRow[] {
  if (filter === "all") return [...rows];
  return rows.filter((r) => r.actor === filter);
}

// ─── HITL gate state derived from events (no business logic — pure read) ─

export interface GateState {
  id: string;
  label: string;
  status: "completed" | "pending" | "queued";
  decision?: string;
  decidedAt?: string;
  /** Index of the human_action_pending event for this gate, if any */
  pendingIdx?: number;
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
    const pendingIdx = pendingEvt
      ? events.indexOf(pendingEvt)
      : undefined;
    if (completedEvt) {
      return {
        id: g,
        label: HITL_LABEL[g] ?? g,
        status: "completed" as const,
        decision: completedEvt.decision,
        decidedAt: completedEvt.at,
        pendingIdx,
      };
    }
    if (pendingEvt) {
      return {
        id: g,
        label: HITL_LABEL[g] ?? g,
        status: "pending" as const,
        pendingIdx,
      };
    }
    return { id: g, label: HITL_LABEL[g] ?? g, status: "queued" as const };
  });
}
