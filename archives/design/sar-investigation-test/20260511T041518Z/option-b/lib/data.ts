// Option B — wildcard "regulatory-clock-first" view.
//
// The data layer is read-only: every export below re-exports values from
// the single source of truth at `_shared/mock-data.ts`. The adapters
// BELOW the re-export bar are pure shape transforms (event → clock-anchored
// section) — no business logic, no math beyond timestamp arithmetic.

import {
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
  CANVAS_SHA256,
  CASE_SHAPE,
  COMPLIANCE_SCOPE,
  HITL_GATES,
  LIVE_CASE,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  PRIMARY_SUBJECT,
  REG_DEADLINE_AT,
  REG_DETECTED_AT,
  REG_REGIME,
  REG_WINDOW_DAYS,
  RULE_VERDICTS,
  SHARED_RULES,
  SUBJECTS,
  USE_CASE_ID,
  type CaseShape,
  type Subject,
} from "../../_shared/mock-data";

export {
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
  CANVAS_SHA256,
  CASE_SHAPE,
  COMPLIANCE_SCOPE,
  HITL_GATES,
  LIVE_CASE,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  PRIMARY_SUBJECT,
  REG_DEADLINE_AT,
  REG_DETECTED_AT,
  REG_REGIME,
  REG_WINDOW_DAYS,
  RULE_VERDICTS,
  SHARED_RULES,
  SUBJECTS,
  USE_CASE_ID,
};

export type { CaseShape, Subject };

// ─── raw event shape ────────────────────────────────────────────────────
interface RawEvt {
  at: string;
  kind: string;
  stage?: string;
  signal?: string;
  source?: string;
  service?: string;
  agent?: string;
  gate?: string;
  decision?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  confidence?: number;
}

// ─── case lookup ─────────────────────────────────────────────────────────

export interface CaseRecord {
  id: string;
  title: string;
  subject: Subject;
  current_stage: string;
  decision: string;
  decision_kind: string;
  hitl_gates: readonly string[];
  rule_verdicts: Record<string, "pass" | "watch" | "fail" | "skip">;
  events: readonly RawEvt[];
  detected_at: string;
  deadline_at: string;
  reg_regime: string;
  reg_window_days: number;
}

/**
 * Look up a case by canonical id. The mock data ships a single live case;
 * any id resolves to it (the param is preserved verbatim so the URL stays
 * meaningful and the page shows the right subject).
 */
export function getCase(id: string): CaseRecord {
  return {
    id: id || LIVE_CASE.id,
    title: LIVE_CASE.title,
    subject: LIVE_CASE.subject,
    current_stage: LIVE_CASE.current_stage,
    decision: LIVE_CASE.decision,
    decision_kind: LIVE_CASE.decision_kind,
    hitl_gates: LIVE_CASE.hitl_gates,
    rule_verdicts: LIVE_CASE.rule_verdicts,
    events: LIVE_CASE.events as readonly RawEvt[],
    detected_at: LIVE_CASE.detected_at,
    deadline_at: LIVE_CASE.deadline_at,
    reg_regime: LIVE_CASE.reg_regime,
    reg_window_days: LIVE_CASE.reg_window_days,
  };
}

// ─── clock-anchored sections ────────────────────────────────────────────
// The metaphor: every event in PIPELINE_EVENTS is placed on the 30-day
// SAR axis by "days elapsed since detection". The page then groups events
// into a small number of fixed sections by their position along that axis,
// so the case reads as a sequence of "what happens by when".

export type ClockBucket =
  | "day-0-detection"
  | "day-1-3-triage"
  | "day-4-14-investigation"
  | "day-15-25-drafting"
  | "day-26-30-review";

export interface ClockSection {
  bucket: ClockBucket;
  /** Banker-readable label, e.g. "Days 4 – 14 · Investigation" */
  label: string;
  /** Sub-eyebrow describing what happens in this band */
  subtitle: string;
  /** Lower (inclusive) and upper (exclusive) day boundary on the 30-day axis */
  range: [number, number];
  events: ClockEvent[];
}

export interface ClockEvent {
  idx: number;
  at: string;
  /** Days elapsed since detection (float, two decimals) */
  daySinceDetection: number;
  /** Days remaining when the event occurred (float, two decimals) */
  daysRemaining: number;
  actor: "system" | "service" | "agent" | "human" | "gate";
  speaker: string;
  headline: string;
  detail?: string;
  gate?: string;
  decision?: string;
  ref?: string;
  meta?: {
    latencyMs?: number;
    tokensIn?: number;
    tokensOut?: number;
    confidence?: number;
  };
}

const HITL_LABEL: Record<string, string> = {
  final_approval: "Final SAR signoff",
};

const STAGE_LABEL: Record<string, string> = {
  detected: "Detected",
  triage: "Triage",
  investigation: "Investigation",
  narrative_drafting: "Narrative drafting",
  officer_review: "Officer review",
  filed: "Filed",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;
}

function bucketForDay(day: number): ClockBucket {
  if (day < 1)  return "day-0-detection";
  if (day < 4)  return "day-1-3-triage";
  if (day < 15) return "day-4-14-investigation";
  if (day < 26) return "day-15-25-drafting";
  return "day-26-30-review";
}

function toClockEvent(
  e: RawEvt,
  idx: number,
  detectedAt: string,
  windowDays: number,
): ClockEvent {
  const day = daysBetween(detectedAt, e.at);
  const remaining = windowDays - day;
  const base = {
    idx,
    at: e.at,
    daySinceDetection: Math.round(day * 100) / 100,
    daysRemaining: Math.round(remaining * 100) / 100,
  };
  switch (e.kind) {
    case "stage_entered":
      return {
        ...base,
        actor: "system",
        speaker: "pipeline",
        headline: `Entered stage “${STAGE_LABEL[e.stage ?? ""] ?? e.stage}”`,
      };
    case "detection_signal":
      return {
        ...base,
        actor: "system",
        speaker: e.source ?? "detector",
        headline: `Detection signal: ${e.signal ?? "unknown"}`,
        detail: "Initial trigger; the 30-day clock starts here.",
      };
    case "service_invoked":
      return {
        ...base,
        actor: "service",
        speaker: e.service ?? "service",
        headline: `Ran ${e.service}`,
        ref: e.service,
        meta: { latencyMs: e.latency_ms },
      };
    case "agent_invoked":
      return {
        ...base,
        actor: "agent",
        speaker: e.agent ?? "agent",
        headline: `${e.agent} reasoned`,
        ref: e.agent,
        meta: { tokensIn: e.tokens_in, tokensOut: e.tokens_out },
      };
    case "human_action_pending":
      return {
        ...base,
        actor: "gate",
        speaker: HITL_LABEL[e.gate ?? ""] ?? e.gate ?? "gate",
        headline: `${HITL_LABEL[e.gate ?? ""] ?? e.gate} requested`,
        detail: "Awaiting BSA officer disposition.",
        gate: e.gate,
      };
    case "human_action":
      return {
        ...base,
        actor: "human",
        speaker: HITL_LABEL[e.gate ?? ""] ?? e.gate ?? "officer",
        headline: `${HITL_LABEL[e.gate ?? ""] ?? e.gate} → ${e.decision}`,
        gate: e.gate,
        decision: e.decision,
      };
    default:
      return {
        ...base,
        actor: "system",
        speaker: "pipeline",
        headline: e.kind,
      };
  }
}

const SECTION_TEMPLATE: Array<{ bucket: ClockBucket; label: string; subtitle: string; range: [number, number] }> = [
  {
    bucket: "day-0-detection",
    label: "Day 0 · Detection",
    subtitle: "30 days remaining. The clock starts.",
    range: [0, 1],
  },
  {
    bucket: "day-1-3-triage",
    label: "Days 1 – 3 · Triage",
    subtitle: "29 – 27 days remaining. Categorize, screen, scope.",
    range: [1, 4],
  },
  {
    bucket: "day-4-14-investigation",
    label: "Days 4 – 14 · Investigation",
    subtitle: "26 – 16 days remaining. Atomic services + agent fan-out.",
    range: [4, 15],
  },
  {
    bucket: "day-15-25-drafting",
    label: "Days 15 – 25 · Narrative drafting",
    subtitle: "15 – 5 days remaining. Draft the SAR narrative.",
    range: [15, 26],
  },
  {
    bucket: "day-26-30-review",
    label: "Days 26 – 30 · Officer review & filing",
    subtitle: "4 – 0 days remaining. BSA officer signs and files.",
    range: [26, 31],
  },
];

/**
 * Group every event into the section whose [low, high) day range it falls
 * into. Pure shape transform — no decisions, no business math.
 */
export function toClockSections(
  events: readonly RawEvt[],
  detectedAt: string,
  windowDays: number,
): ClockSection[] {
  const sections: ClockSection[] = SECTION_TEMPLATE.map((s) => ({
    bucket: s.bucket,
    label: s.label,
    subtitle: s.subtitle,
    range: s.range,
    events: [],
  }));
  events.forEach((e, idx) => {
    const ce = toClockEvent(e, idx, detectedAt, windowDays);
    const target = sections.find(
      (s) =>
        ce.daySinceDetection >= s.range[0] &&
        ce.daySinceDetection < s.range[1],
    );
    if (target) target.events.push(ce);
  });
  return sections;
}

// ─── HITL gate state derived from events (no business logic) ────────────

export interface GateState {
  id: string;
  label: string;
  status: "completed" | "pending" | "queued";
  decision?: string;
  decidedAt?: string;
  pendingIdx?: number;
  daysRemainingWhenPending?: number;
}

export function gateStates(
  events: readonly RawEvt[],
  hitlGates: readonly string[],
  detectedAt: string,
  windowDays: number,
): GateState[] {
  return hitlGates.map((g) => {
    const pendingEvt = events.find(
      (e) => e.kind === "human_action_pending" && e.gate === g,
    );
    const completedEvt = events.find(
      (e) => e.kind === "human_action" && e.gate === g,
    );
    const pendingIdx = pendingEvt ? events.indexOf(pendingEvt) : undefined;
    const daysRemainingWhenPending = pendingEvt
      ? Math.round((windowDays - daysBetween(detectedAt, pendingEvt.at)) * 100) / 100
      : undefined;
    if (completedEvt) {
      return {
        id: g,
        label: HITL_LABEL[g] ?? g,
        status: "completed" as const,
        decision: completedEvt.decision,
        decidedAt: completedEvt.at,
        pendingIdx,
        daysRemainingWhenPending,
      };
    }
    if (pendingEvt) {
      return {
        id: g,
        label: HITL_LABEL[g] ?? g,
        status: "pending" as const,
        pendingIdx,
        daysRemainingWhenPending,
      };
    }
    return {
      id: g,
      label: HITL_LABEL[g] ?? g,
      status: "queued" as const,
    };
  });
}

// ─── workflow stage rail data (shared primitive) ────────────────────────
// Map of stage_entered events; gives the WorkflowStageRail something to
// highlight as the case advances along the SAR axis.

export interface StageBeat {
  id: string;
  label: string;
  at?: string;
  daysRemaining?: number;
}

export function stageBeats(
  events: readonly RawEvt[],
  detectedAt: string,
  windowDays: number,
): StageBeat[] {
  return CASE_SHAPE.stages.map((s) => {
    const entered = events.find((e) => e.kind === "stage_entered" && e.stage === s);
    if (!entered) {
      return { id: s, label: STAGE_LABEL[s] ?? s };
    }
    const dr = windowDays - daysBetween(detectedAt, entered.at);
    return {
      id: s,
      label: STAGE_LABEL[s] ?? s,
      at: entered.at,
      daysRemaining: Math.round(dr * 100) / 100,
    };
  });
}
