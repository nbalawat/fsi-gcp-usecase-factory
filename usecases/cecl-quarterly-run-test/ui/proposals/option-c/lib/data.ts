// Option C — affordance axis ("actions live where the data is").
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No business math, no
// thresholds, no decisions in this module — only pure shape transforms
// (events → row models, gate states, run window).

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

// Auditor-pinned canvas SHA. Distinct from the generated CANVAS_SHA256 so
// the auditor can mutate it without re-running the mock-data generator.
export const AUDITOR_CANVAS_SHA256 =
  "91f47921f8c50735facca5d50696e98661c7111fba41cbcb0ae0f1ebb7848b27";

// ─── HITL gate model ────────────────────────────────────────────────────
// The canvas ships gates as an array of {name, irrevocable, description}.
// We use the raw structured form (not just strings) so every gate event
// the timeline references is type-safe.

export interface HitlGate {
  name: string;
  irrevocable: boolean;
  description: string;
}

// ─── raw event type ─────────────────────────────────────────────────────

export interface RawEvt {
  at: string;
  kind: string;
  stage?: string;
  doc_type?: string;
  service?: string;
  agent?: string;
  gate?: HitlGate;
  decision?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  confidence?: number;
}

// ─── run case lookup ────────────────────────────────────────────────────

export interface RunRecord {
  id: string;
  title: string;
  primary_actor: string;
  decision_kind: string;
  stages: readonly string[];
  current_stage: string;
  decision: string;
  events: readonly RawEvt[];
  hitl_gates: readonly HitlGate[];
  rule_verdicts: Record<string, "pass" | "watch" | "fail" | "skip">;
}

export function getRun(id: string): RunRecord {
  return {
    id: id || LIVE_CASE.id,
    title: LIVE_CASE.title,
    primary_actor: CASE_SHAPE.primary_actor,
    decision_kind: CASE_SHAPE.decision_kind,
    stages: CASE_SHAPE.stages,
    current_stage: LIVE_CASE.current_stage,
    decision: LIVE_CASE.decision,
    events: LIVE_CASE.events as readonly RawEvt[],
    hitl_gates: LIVE_CASE.hitl_gates as readonly HitlGate[],
    rule_verdicts: LIVE_CASE.rule_verdicts,
  };
}

// ─── segment row model ──────────────────────────────────────────────────
// The "segment" is the unit of CECL methodology — a slice of the portfolio
// that shares a PD/LGD model. Each borrower in the mock canvas becomes one
// segment row on the run-overview. Numbers are deterministic projections
// of borrower attributes (NOT computed reserve math; the canvas does that
// upstream — this UI only displays).

export type SegmentVerdict = "ready" | "variance" | "queued" | "approved";

export interface SegmentInputs {
  /** Probability of default, displayed as "1.20%" — never a decision */
  pd_bps: number;
  /** Loss given default, displayed as "32%" */
  lgd_pct: number;
  /** Exposure at default in USD */
  ead_usd: number;
  /** Expected credit loss reserve in USD (pd × lgd × ead, pre-computed) */
  ecl_usd: number;
}

export interface SegmentRow {
  id: string;
  borrower: Borrower;
  /** Banker-readable segment label */
  label: string;
  /** Risk band (1-pass etc.) — drives ring tint */
  riskBand: Borrower["risk_band"];
  /** Computed verdict — drives which inline action surfaces */
  verdict: SegmentVerdict;
  inputs: SegmentInputs;
  /** Methodology owner who must approve */
  methodologyOwner: string;
  /** Inline action label */
  primaryAction: string;
  /** True if the inline action is reversible (per canvas hitl_gates contract) */
  reversible: boolean;
  /** Banker-readable variance reason if verdict==="variance" */
  varianceReason?: string;
  /** Number of agent reasoning hops surfaced for this segment */
  agentHops: number;
}

const SEGMENT_LABELS: Record<string, string> = {
  "1-pass": "CRE Pass / NAICS-33",
  "2-special-mention": "Special-mention / NAICS-33",
  "3-substandard": "Substandard / NAICS-33",
  "4-doubtful": "Doubtful / NAICS-33",
  "5-loss": "Loss / NAICS-33",
};

const METHODOLOGY_OWNERS = [
  "K. Whitfield, Risk Analytics",
  "S. Park, Methodology",
  "D. Pratap, Reserve Lead",
];

const VARIANCE_REASONS = [
  "PD delta +18 bps vs Q1 — pending Q&A",
  "LGD model drift > 5σ from peer band",
  "EAD outlier > 2× segment mean",
];

/**
 * Build the segment list deterministically from BORROWERS. Pure projection
 * — no decisions, no math beyond display-formatting helpers. The variance
 * slot is determined by a stable position parity on the borrower index so
 * the demo always shows at least one inline-variance row.
 */
export function toSegmentRows(borrowers: readonly Borrower[]): SegmentRow[] {
  return borrowers.map((b, idx): SegmentRow => {
    // Display projections — derived from borrower attributes; NOT business
    // math. Same input → same output (deterministic).
    const pd_bps = 120 + (idx * 17) % 280;
    const lgd_pct = 28 + (idx * 7) % 22;
    const ead_usd = Math.round(b.revenue_usd * 0.02);
    const ecl_usd = Math.round(
      (pd_bps / 10000) * (lgd_pct / 100) * ead_usd,
    );

    const isVariance = idx % 4 === 2;
    const isApproved = idx % 4 === 0;
    const isQueued = idx % 4 === 3;
    const verdict: SegmentVerdict = isVariance
      ? "variance"
      : isApproved
        ? "approved"
        : isQueued
          ? "queued"
          : "ready";

    return {
      id: `SEG-${b.id}`,
      borrower: b,
      label: SEGMENT_LABELS[b.risk_band] ?? `Segment / ${b.risk_band}`,
      riskBand: b.risk_band,
      verdict,
      inputs: { pd_bps, lgd_pct, ead_usd, ecl_usd },
      methodologyOwner: METHODOLOGY_OWNERS[idx % METHODOLOGY_OWNERS.length],
      primaryAction:
        verdict === "approved"
          ? "Approved — view methodology"
          : verdict === "variance"
            ? "Open variance Q&A"
            : verdict === "queued"
              ? "Waiting for upstream agent"
              : "Approve methodology",
      reversible: verdict !== "approved",
      varianceReason:
        verdict === "variance"
          ? VARIANCE_REASONS[idx % VARIANCE_REASONS.length]
          : undefined,
      agentHops: 2 + (idx % 3),
    };
  });
}

// ─── HITL gate state derived from events ────────────────────────────────

export interface GateState {
  name: string;
  label: string;
  irrevocable: boolean;
  description: string;
  status: "completed" | "pending" | "queued";
  decision?: string;
  decidedAt?: string;
  pendingIdx?: number;
  completedIdx?: number;
}

const GATE_LABEL: Record<string, string> = {
  approve_segment_methodology: "Approve segment methodology",
  cfo_attest_run: "CFO attest run",
};

export function gateStates(
  events: readonly RawEvt[],
  gates: readonly HitlGate[],
): GateState[] {
  return gates.map((g) => {
    const pendingIdx = events.findIndex(
      (e) => e.kind === "human_action_pending" && e.gate?.name === g.name,
    );
    const completedIdx = events.findIndex(
      (e) => e.kind === "human_action" && e.gate?.name === g.name,
    );
    const completedEvt = completedIdx >= 0 ? events[completedIdx] : undefined;
    if (completedEvt) {
      return {
        name: g.name,
        label: GATE_LABEL[g.name] ?? g.name,
        irrevocable: g.irrevocable,
        description: g.description,
        status: "completed" as const,
        decision: completedEvt.decision,
        decidedAt: completedEvt.at,
        pendingIdx: pendingIdx >= 0 ? pendingIdx : undefined,
        completedIdx,
      };
    }
    if (pendingIdx >= 0) {
      return {
        name: g.name,
        label: GATE_LABEL[g.name] ?? g.name,
        irrevocable: g.irrevocable,
        description: g.description,
        status: "pending" as const,
        pendingIdx,
      };
    }
    return {
      name: g.name,
      label: GATE_LABEL[g.name] ?? g.name,
      irrevocable: g.irrevocable,
      description: g.description,
      status: "queued" as const,
    };
  });
}

// ─── audit row shape (for inline reasoning panel + audit ledger) ────────

export type AuditActor = "system" | "service" | "agent" | "human" | "gate";

export interface AuditRow {
  idx: number;
  at: string;
  actor: AuditActor;
  speaker: string;
  headline: string;
  detail?: string;
  gate?: string;
  decision?: string;
}

export function toAuditRows(events: readonly RawEvt[]): AuditRow[] {
  return events.map((e, idx): AuditRow => {
    const base = { idx, at: e.at };
    switch (e.kind) {
      case "stage_entered":
        return {
          ...base,
          actor: "system" as const,
          speaker: "pipeline",
          headline: `Stage → ${e.stage}`,
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
          detail:
            e.confidence !== undefined
              ? `confidence ${Math.round(e.confidence * 100)}%`
              : undefined,
        };
      case "service_invoked":
        return {
          ...base,
          actor: "service" as const,
          speaker: e.service ?? "service",
          headline: `Ran ${e.service}`,
          detail: e.latency_ms ? `${e.latency_ms}ms` : undefined,
        };
      case "agent_invoked":
        return {
          ...base,
          actor: "agent" as const,
          speaker: e.agent ?? "agent",
          headline: `${e.agent} reasoned`,
          detail:
            e.tokens_in !== undefined && e.tokens_out !== undefined
              ? `↑ ${e.tokens_in}t ↓ ${e.tokens_out}t`
              : undefined,
        };
      case "human_action_pending":
        return {
          ...base,
          actor: "gate" as const,
          speaker: GATE_LABEL[e.gate?.name ?? ""] ?? e.gate?.name ?? "gate",
          headline: `${GATE_LABEL[e.gate?.name ?? ""] ?? e.gate?.name} requested`,
          detail: e.gate?.description,
          gate: e.gate?.name,
        };
      case "human_action":
        return {
          ...base,
          actor: "human" as const,
          speaker: GATE_LABEL[e.gate?.name ?? ""] ?? e.gate?.name ?? "reviewer",
          headline: `${GATE_LABEL[e.gate?.name ?? ""] ?? e.gate?.name} → ${e.decision}`,
          gate: e.gate?.name,
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

// ─── CECL run window ────────────────────────────────────────────────────
// CECL is quarterly; the run window is the analyst's quarter-close
// deadline. Deterministic projection — start at first event, end +14 days
// (typical close window for a quarterly CECL run). Pure shape.

export interface RunWindow {
  startedAt: string;
  deadline: string;
  regulatoryRegime: string;
}

export function runWindow(events: readonly RawEvt[]): RunWindow {
  const startedAt = events[0]?.at ?? new Date().toISOString();
  const start = new Date(startedAt);
  const deadline = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    startedAt,
    deadline: deadline.toISOString(),
    regulatoryRegime: "FASB ASC 326 · CECL Q2 close (14d)",
  };
}

// ─── methodology owner lookup ────────────────────────────────────────────
// Maps a segment to the human who must approve it. Pure data, no
// decisions — the canvas dictates this mapping, not the UI.

export interface MethodologyOwnerStat {
  owner: string;
  segmentCount: number;
  awaiting: number;
}

export function methodologyOwnerStats(
  segments: readonly SegmentRow[],
): MethodologyOwnerStat[] {
  const map = new Map<string, MethodologyOwnerStat>();
  segments.forEach((s) => {
    const cur = map.get(s.methodologyOwner) ?? {
      owner: s.methodologyOwner,
      segmentCount: 0,
      awaiting: 0,
    };
    cur.segmentCount += 1;
    if (s.verdict === "ready" || s.verdict === "variance") {
      cur.awaiting += 1;
    }
    map.set(s.methodologyOwner, cur);
  });
  return Array.from(map.values());
}

// ─── run-level totals (display-only) ────────────────────────────────────

export interface RunTotals {
  segmentCount: number;
  approvedCount: number;
  varianceCount: number;
  readyCount: number;
  queuedCount: number;
  totalEcl: number;
  totalEad: number;
  weightedPdBps: number;
}

export function runTotals(segments: readonly SegmentRow[]): RunTotals {
  const totalEcl = segments.reduce((acc, s) => acc + s.inputs.ecl_usd, 0);
  const totalEad = segments.reduce((acc, s) => acc + s.inputs.ead_usd, 0);
  const weightedPdBps =
    totalEad > 0
      ? Math.round(
          segments.reduce(
            (acc, s) => acc + s.inputs.pd_bps * s.inputs.ead_usd,
            0,
          ) / totalEad,
        )
      : 0;
  return {
    segmentCount: segments.length,
    approvedCount: segments.filter((s) => s.verdict === "approved").length,
    varianceCount: segments.filter((s) => s.verdict === "variance").length,
    readyCount: segments.filter((s) => s.verdict === "ready").length,
    queuedCount: segments.filter((s) => s.verdict === "queued").length,
    totalEcl,
    totalEad,
    weightedPdBps,
  };
}

// ─── formatting helpers (display only) ──────────────────────────────────

export const fmtCurrency = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: n > 999_999 ? "compact" : "standard",
  }).format(n);

export const fmtPctBps = (bps: number): string =>
  `${(bps / 100).toFixed(2)}%`;

export const fmtPct = (pct: number): string => `${pct.toFixed(0)}%`;
