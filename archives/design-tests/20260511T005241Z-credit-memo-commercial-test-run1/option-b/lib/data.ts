// Option B — workflow-first metaphor.
// Re-exports from the shared mock-data contract, plus narrow view-model
// helpers that REGROUP existing values (no business logic, no thresholds,
// no math — see CLAUDE.md "Forbidden patterns").

import {
  CASE_SHAPE,
  HITL_GATES,
  LIVE_CASE,
  PIPELINE_EVENTS,
  PRIMARY_BORROWER as PRIMARY_BORROWER_RAW,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  CANVAS_SHA256,
  MODEL_PROVIDER,
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
} from "../../_shared/mock-data";

export {
  CASE_SHAPE,
  HITL_GATES,
  LIVE_CASE,
  PIPELINE_EVENTS,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  CANVAS_SHA256,
  MODEL_PROVIDER,
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
};

// Defensive accessor: mock-data declares `PRIMARY_BORROWER = BORROWERS[0]`
// which is typed `Borrower | undefined` under `noUncheckedIndexedAccess`.
// We fall back to a canvas-shaped placeholder so the UI never crashes; in
// practice the canvas always has at least one borrower (Lincoln Electric).
export const PRIMARY_BORROWER = PRIMARY_BORROWER_RAW ?? {
  id: "BRW-UNKNOWN",
  name: "(borrower unknown)",
  naics: "—",
  revenue_usd: 0,
  geo: "—",
  risk_band: "1-pass",
};

export type PipelineEvent = (typeof PIPELINE_EVENTS)[number];

/**
 * Position of a stage in the workflow.
 *  - "past"    → completed (compressed to the rail)
 *  - "current" → hero (60% viewport)
 *  - "future"  → dimmed, visible
 *
 * Pure mapping over CASE_SHAPE.stages — no decision logic.
 */
export type StagePosition = "past" | "current" | "future";

export interface StageView {
  id: string;
  index: number;
  position: StagePosition;
  /** Most recent event for this stage, if any */
  enteredAt?: string;
  /** Optional event tally (count of events tagged with this stage) */
  eventCount: number;
  /** Whether a HITL gate is associated with this stage */
  gate?: string;
}

/** Map each canvas stage to a HITL gate when one is associated. */
const STAGE_TO_GATE: Record<string, string> = {
  extracting: "extraction_review",
  rating: "rating_review",
  drafting: "draft_review",
  approval: "final_approval",
};

/** Given a current-stage id, return one StageView per canvas stage. */
export function buildStageViews(currentStageId: string): StageView[] {
  const stages = CASE_SHAPE.stages;
  const currentIdx = stages.indexOf(currentStageId);
  const safeCurrent = currentIdx === -1 ? stages.length - 1 : currentIdx;

  // Tally events per stage by scanning stage_entered events and bracketing.
  const enteredAtByStage: Record<string, string> = {};
  const eventCountByStage: Record<string, number> = {};
  let cursor: string | undefined;
  for (const e of PIPELINE_EVENTS) {
    if (e.kind === "stage_entered" && "stage" in e && typeof e.stage === "string") {
      cursor = e.stage;
      enteredAtByStage[cursor] ??= e.at;
    }
    if (cursor) {
      eventCountByStage[cursor] = (eventCountByStage[cursor] ?? 0) + 1;
    }
  }

  return stages.map((id, index) => {
    const position: StagePosition =
      index < safeCurrent ? "past" : index === safeCurrent ? "current" : "future";
    return {
      id,
      index,
      position,
      enteredAt: enteredAtByStage[id],
      eventCount: eventCountByStage[id] ?? 0,
      gate: STAGE_TO_GATE[id],
    };
  });
}

/** Filter PIPELINE_EVENTS that fall under a given stage (between
 *  consecutive stage_entered markers). Defensive: tolerant to missing
 *  markers. */
export function eventsForStage(stageId: string): PipelineEvent[] {
  const out: PipelineEvent[] = [];
  let active: string | undefined;
  for (const e of PIPELINE_EVENTS) {
    if (e.kind === "stage_entered" && "stage" in e) {
      active = (e as { stage?: string }).stage;
    }
    if (active === stageId) {
      out.push(e);
    }
  }
  return out;
}

/** Latest event overall (defensive — returns undefined on empty). */
export function latestEvent(): PipelineEvent | undefined {
  return PIPELINE_EVENTS[PIPELINE_EVENTS.length - 1];
}

/** Friendly stage display label. Vocabulary only — no math. */
export function stageLabel(id: string): string {
  switch (id) {
    case "intake":
      return "Intake";
    case "extracting":
      return "Extracting";
    case "analyzing":
      return "Analyzing";
    case "spreading":
      return "Spreading";
    case "rating":
      return "Rating";
    case "drafting":
      return "Drafting";
    case "reviewing":
      return "Reviewing";
    case "approval":
      return "Approval";
    case "done":
      return "Done";
    default:
      return id;
  }
}

/** Friendly verdict pill for a rules check. */
export function verdictTone(
  verdict: "pass" | "watch" | "fail" | "skip" | undefined
): "success" | "warning" | "danger" | "neutral" {
  if (verdict === "pass") return "success";
  if (verdict === "watch") return "warning";
  if (verdict === "fail") return "danger";
  return "neutral";
}

/** Friendly gate display label. */
export function gateLabel(gate: string): string {
  switch (gate) {
    case "extraction_review":
      return "Extraction review";
    case "rating_review":
      return "Rating review";
    case "draft_review":
      return "Draft review";
    case "final_approval":
      return "Final approval";
    default:
      return gate;
  }
}

/** Has this gate already been actioned by a human in PIPELINE_EVENTS? */
export function gateDecision(
  gate: string
): { decision: string; at: string } | undefined {
  for (const e of PIPELINE_EVENTS) {
    if (
      e.kind === "human_action" &&
      "gate" in e &&
      (e as { gate?: string }).gate === gate
    ) {
      return {
        decision: (e as { decision?: string }).decision ?? "approve",
        at: e.at,
      };
    }
  }
  return undefined;
}

/** Short formatted "Xh Ym ago" relative to a fixed mock "now" — keeps
 *  rendering deterministic across SSR. */
const MOCK_NOW = new Date(
  PIPELINE_EVENTS[PIPELINE_EVENTS.length - 1]?.at ?? "2026-05-09T08:18:00.000Z"
).getTime();

export function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const deltaMs = MOCK_NOW - t;
  if (deltaMs < 0) return "scheduled";
  const s = Math.round(deltaMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ${m % 60}m ago`;
}
