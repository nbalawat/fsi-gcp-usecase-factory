// Option A — sparse executive CECL view.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. Adapters BELOW the
// re-export bar are pure shape transforms (event → stage state, borrower
// → segment ledger row). No business logic, no thresholds, no math that
// would otherwise live in the rules engine or an atomic service.

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

// The canvas SHA the parent caller pinned for this design conversation.
// Kept separate from CANVAS_SHA256 (which is the generator's content hash
// of the shared mock-data) — both are echoed in manifest.yaml.
export const DESIGN_CANVAS_SHA256 =
  "91f47921f8c50735facca5d50696e98661c7111fba41cbcb0ae0f1ebb7848b27";

// ─── CECL stage shape (4 stages, executive-readable) ────────────────────
//
// The seed prompt is authoritative: the four stages of a quarterly CECL
// run are segmentation → projection → exception review → CFO attestation.
// We map each canonical stage to one stage on the rail; status comes from
// the pipeline events emitted by the workflow.

export type RailStageId =
  | "segment_classification"
  | "pd_lgd_projection"
  | "exception_review"
  | "cfo_attestation";

export type StageStatus = "done" | "active" | "pending" | "queued";

export interface RailStage {
  id: RailStageId;
  label: string;
  shortLabel: string;
  /** "Owner" the executive sees beside each stage. */
  owner: string;
  /** Banker-readable one-liner — appears under the stage label. */
  caption: string;
  status: StageStatus;
  /** Count of items processed in this stage (e.g. segments classified). */
  count: number;
  /** Unit for the count (segments, projections, exceptions, sign-offs). */
  countUnit: string;
  /** Stage type — feeds into the StageType badge for the rail. */
  type: "agent" | "human" | "mixed";
}

// Build the rail by reading event activity from the spine. A stage is
// "active" if it has events but no done-event after it; "done" once the
// next stage's event arrives. No business decisions made here.
export function buildRail(events: readonly RawEvt[]): RailStage[] {
  const hasAgent = events.some((e) => e.kind === "agent_invoked");
  const hasService = events.some((e) => e.kind === "service_invoked");
  const draftDone = events.some(
    (e) => e.kind === "human_action" && e.gate === "draft_review",
  );
  const finalPending = events.some(
    (e) => e.kind === "human_action_pending" && e.gate === "final_approval",
  );
  const finalDone = events.some(
    (e) => e.kind === "human_action" && e.gate === "final_approval",
  );

  // Stage 1 — segment classification (done once spreader/aggregator ran)
  const seg: StageStatus = hasService ? "done" : "active";
  // Stage 2 — PD/LGD projection (done once rater agent ran)
  const proj: StageStatus = hasAgent
    ? "done"
    : seg === "done"
      ? "active"
      : "queued";
  // Stage 3 — exception review (done once draft_review gate cleared)
  const exc: StageStatus = draftDone
    ? "done"
    : proj === "done"
      ? "active"
      : "queued";
  // Stage 4 — CFO attestation (active once final_approval pending, done once decided)
  const cfo: StageStatus = finalDone
    ? "done"
    : finalPending
      ? "active"
      : exc === "done"
        ? "pending"
        : "queued";

  return [
    {
      id: "segment_classification",
      label: "Segment classification",
      shortLabel: "Segment",
      owner: "Risk Analytics",
      caption: "NAICS × geo × revenue band — 12 segments resolved",
      status: seg,
      count: 12,
      countUnit: "segments",
      type: "agent",
    },
    {
      id: "pd_lgd_projection",
      label: "PD / LGD projection",
      shortLabel: "Projection",
      owner: "Quantitative Models",
      caption: "PD, LGD, EAD over 8 forecast quarters per segment",
      status: proj,
      count: 96,
      countUnit: "projections",
      type: "mixed",
    },
    {
      id: "exception_review",
      label: "Exception review",
      shortLabel: "Exceptions",
      owner: "Credit Risk Officer",
      caption: "Segments breaching model-confidence floor or qual-overlay",
      status: exc,
      count: 3,
      countUnit: "exceptions",
      type: "human",
    },
    {
      id: "cfo_attestation",
      label: "CFO attestation",
      shortLabel: "Attest",
      owner: "Chief Financial Officer",
      caption: "Allowance signed for SEC 10-Q + OCC ALLL filing",
      status: cfo,
      count: cfo === "done" ? 1 : 0,
      countUnit: "sign-offs",
      type: "human",
    },
  ];
}

// ─── ledger row shape (segments × periods × bps) ────────────────────────
//
// The numeric ledger that appears when a stage is clicked. One row per
// borrower segment, with PD / LGD / EAD / ECL_bps / ECL_$M and a
// reserve-band tag. Values are deterministic transforms of the borrower
// fixture so the same canvas always produces the same numbers.

export interface LedgerRow {
  segmentId: string;
  segmentName: string;
  naics: string;
  geo: string;
  /** Loans-outstanding in $M (EAD proxy). */
  ead_usd_m: number;
  /** PD in bps over the next 4 quarters. */
  pd_bps: number;
  /** LGD as a fraction (0..1). */
  lgd_pct: number;
  /** ECL in bps of EAD. */
  ecl_bps: number;
  /** ECL in $M. */
  ecl_usd_m: number;
  /** Reserve band — the risk-band token from the borrower fixture. */
  riskBand: string;
  /** True if this segment landed in exception review. */
  exception: boolean;
  /** Human-readable exception reason when exception=true. */
  exceptionReason?: string;
}

// Deterministic transform: hash the segment id to derive bps.
function hashByte(s: string, i: number): number {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = (h * 16777619) >>> 0;
  }
  return (h >>> (i * 4)) & 0xff;
}

export function buildLedger(borrowers: readonly Borrower[]): LedgerRow[] {
  return borrowers.map((b) => {
    const ead = Math.round((b.revenue_usd / 1_000_000) * 0.018); // ~1.8% of revenue
    const pdBase = 40 + (hashByte(b.id, 0) % 240); // 40–280 bps
    const lgd = 0.25 + (hashByte(b.id, 1) % 35) / 100; // 25–60%
    const eclBps = Math.round(pdBase * lgd);
    const ecl = Math.round((ead * eclBps) / 100) / 100; // $M, 2dp
    const exception =
      b.risk_band === "2-special-mention" && hashByte(b.id, 2) % 2 === 0;
    return {
      segmentId: b.id,
      segmentName: b.name,
      naics: b.naics,
      geo: b.geo,
      ead_usd_m: ead,
      pd_bps: pdBase,
      lgd_pct: lgd,
      ecl_bps: eclBps,
      ecl_usd_m: ecl,
      riskBand: b.risk_band,
      exception,
      exceptionReason: exception
        ? "Model confidence < 0.85 — qual-overlay required"
        : undefined,
    };
  });
}

// ─── run record + OCC clock ────────────────────────────────────────────

export type RunStatusLevel = "on-track" | "watch" | "at-risk";

export interface RunRecord {
  id: string;
  title: string;
  /** Reporting period the run covers. */
  period: string;
  /** ISO when the OCC 30-day clock started for this run. */
  occClockStartedAt: string;
  /** ISO when the OCC deadline expires. */
  occDeadlineAt: string;
  /** ISO when the run was kicked off in the platform. */
  runStartedAt: string;
  /** Status the CRO/CFO sees in the index. */
  runStatus: RunStatusLevel;
  /** Total allowance, $M. */
  totalAllowance_usd_m: number;
  /** Q-over-Q change in allowance, $M. */
  qoqDelta_usd_m: number;
  /** Number of exceptions flagged this quarter. */
  exceptionCount: number;
  /** Borrower fixtures resolved into this run's segments. */
  borrowers: readonly Borrower[];
  events: readonly RawEvt[];
  hitl_gates: readonly string[];
  decision: string;
}

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

// "Today" anchor for the OCC clock — derived from the last event in the
// mock so SSR and CSR agree without a system clock.
function deriveNow(events: readonly RawEvt[]): string {
  const last = events[events.length - 1]?.at;
  return last ?? "2026-05-11T00:00:00Z";
}

// 30-day OCC clock — 7 days have elapsed by "now" in the mock.
function occClockBounds(now: string): { startedAt: string; deadlineAt: string } {
  const t = new Date(now).getTime();
  const startedAt = new Date(t - 7 * 86400 * 1000).toISOString();
  const deadlineAt = new Date(t + 23 * 86400 * 1000).toISOString();
  return { startedAt, deadlineAt };
}

export function getRun(id: string): RunRecord {
  const events = LIVE_CASE.events as readonly RawEvt[];
  const now = deriveNow(events);
  const { startedAt, deadlineAt } = occClockBounds(now);

  // Derive totals from the ledger (no math the rules engine wouldn't do —
  // this is pure presentation aggregation).
  const ledger = buildLedger(BORROWERS);
  const totalAllowance = Math.round(
    ledger.reduce((s, r) => s + r.ecl_usd_m, 0) * 10,
  ) / 10;
  const exceptions = ledger.filter((r) => r.exception).length;

  return {
    id: id || LIVE_CASE.id,
    title: LIVE_CASE.title,
    period: "Q2 2026",
    occClockStartedAt: startedAt,
    occDeadlineAt: deadlineAt,
    runStartedAt: events[0]?.at ?? startedAt,
    runStatus: exceptions > 5 ? "at-risk" : exceptions > 2 ? "watch" : "on-track",
    totalAllowance_usd_m: totalAllowance,
    qoqDelta_usd_m: Math.round((totalAllowance * 0.062) * 10) / 10, // +6.2% QoQ, illustrative
    exceptionCount: exceptions,
    borrowers: BORROWERS,
    events,
    hitl_gates: HITL_GATES,
    decision: LIVE_CASE.decision,
  };
}

// All-runs list for the home dashboard. The current quarter is the live
// run; prior quarters are presented as completed for shape only.
export interface RunSummary {
  id: string;
  period: string;
  status: RunStatusLevel | "published";
  totalAllowance_usd_m: number;
  qoqDelta_usd_m: number;
  exceptions: number;
  filedAt?: string;
}

export function listRuns(): RunSummary[] {
  const live = getRun("");
  return [
    {
      id: live.id,
      period: live.period,
      status: live.runStatus,
      totalAllowance_usd_m: live.totalAllowance_usd_m,
      qoqDelta_usd_m: live.qoqDelta_usd_m,
      exceptions: live.exceptionCount,
    },
    {
      id: "RUN-CECL-2026Q1",
      period: "Q1 2026",
      status: "published",
      totalAllowance_usd_m: Math.round((live.totalAllowance_usd_m - live.qoqDelta_usd_m) * 10) / 10,
      qoqDelta_usd_m: 0.4,
      exceptions: 1,
      filedAt: "2026-02-05T12:00:00Z",
    },
    {
      id: "RUN-CECL-2025Q4",
      period: "Q4 2025",
      status: "published",
      totalAllowance_usd_m: Math.round((live.totalAllowance_usd_m - live.qoqDelta_usd_m - 0.4) * 10) / 10,
      qoqDelta_usd_m: 1.1,
      exceptions: 0,
      filedAt: "2025-11-03T12:00:00Z",
    },
  ];
}

// ─── HITL gate state derived from events (pure read) ───────────────────

export type GateStatus = "completed" | "pending" | "queued";

export interface GateState {
  id: string;
  label: string;
  status: GateStatus;
  decision?: string;
  decidedAt?: string;
}

const GATE_LABEL: Record<string, string> = {
  draft_review: "Draft review",
  final_approval: "CFO attestation",
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
        label: GATE_LABEL[g] ?? g,
        status: "completed",
        decision: completedEvt.decision,
        decidedAt: completedEvt.at,
      };
    }
    if (pendingEvt) {
      return { id: g, label: GATE_LABEL[g] ?? g, status: "pending" };
    }
    return { id: g, label: GATE_LABEL[g] ?? g, status: "queued" };
  });
}

// ─── currency formatting helpers (presentation only) ───────────────────

export function fmtUsdM(n: number): string {
  return `$${n.toFixed(1)}M`;
}

export function fmtBps(n: number): string {
  return `${n} bps`;
}

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
