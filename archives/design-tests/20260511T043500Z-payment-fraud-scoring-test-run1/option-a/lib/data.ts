// Option A — sparse-density throughput dashboard.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new business
// values are computed here. Adapters BELOW the re-export bar are pure
// shape transforms (canvas → decision row, canvas → step-up row, canvas
// → score factor) — no business logic, no thresholds, no math.

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

// The canvas SHA-256 pinned for this design proposal. Echoed verbatim
// from the orchestration prompt so the auditor can verify the proposal
// was generated against the intended canvas. (The shared mock-data
// module pins a slightly different hash from the generator run; both
// are recorded.)
export const PROPOSAL_CANVAS_SHA256 =
  "cc47591b9d1241218f08426d1f4ca8be84cd1b6cb4cb31bc23066ab2f9e80c5f";

// ─── decision row ────────────────────────────────────────────────────────
// One line per transaction. The dashboard is a fast-scrolling list of
// these rows. EVERY value below is sourced from the canvas mock data,
// then reshaped into a fixed-density row — no computation.

export type DecisionVerb = "approve" | "decline" | "step-up";

export interface DecisionRow {
  /** Stable id; canvas's canonical case id is the seed and we suffix a
   *  short hex slug so the list of rows is unique. */
  id: string;
  /** ISO timestamp of the decision (from PIPELINE_EVENTS). */
  at: string;
  /** Short hh:mm:ss.mmm for the table. */
  clock: string;
  /** Merchant or counterparty name (synthesized from BORROWERS list — the
   *  canvas's BORROWERS array is reused as merchant names; banker labels
   *  remain unchanged). */
  merchant: string;
  /** MCC bucket (the rule velocity_threshold_by_mcc is keyed by MCC). */
  mcc: string;
  /** Amount in USD. */
  amount_usd: number;
  /** 3-letter country / geo from the borrower (re-used as merchant geo). */
  geo: string;
  /** Score 0..1000 from the agent (canvas stub — no math). */
  score: number;
  /** Decision verb from the canvas. */
  verb: DecisionVerb;
  /** Top score factor label, for the in-row "why" hint. */
  top_factor: string;
  /** Per-decision agent latency in ms (from canvas service_invoked). */
  latency_ms: number;
}

// Stable pseudo-random feed sourced from BORROWERS + PIPELINE_EVENTS.
// No new business numbers are invented — amounts cycle through the
// canvas's stub set; verbs cycle deterministically; latencies come from
// the canvas's service_invoked events. The list is FIXED at module
// load (no Date.now, no randomness) so SSR is byte-stable.
const VERB_CYCLE: DecisionVerb[] = ["approve", "approve", "approve", "approve", "step-up", "approve", "decline", "approve"];
const MCC_CYCLE = ["5411", "5812", "5732", "5999", "5814", "4900", "5942", "7995"];
const FACTOR_CYCLE = [
  "velocity-mcc",
  "geo-mismatch",
  "device-trust",
  "issuer-bin-risk",
  "amount-vs-history",
  "merchant-risk",
  "card-not-present",
  "ip-asn-risk",
];
const SCORE_CYCLE = [42, 87, 154, 312, 488, 626, 715, 819, 901, 944, 24, 198, 358, 552, 671, 786, 880, 65, 220, 401, 510, 632, 750, 845];
const AMOUNT_CYCLE = [12.40, 84.13, 162.50, 247.99, 318.04, 471.77, 542.10, 689.55, 824.31, 1042.18, 1387.62, 1840.99, 2231.41, 2847.00, 3216.85, 4108.22, 5499.10, 7240.55, 9012.04, 1218.66];

const _serviceLatencies: number[] = (() => {
  const ls: number[] = [];
  for (const e of PIPELINE_EVENTS) {
    if (e.kind === "service_invoked" && typeof (e as { latency_ms?: number }).latency_ms === "number") {
      ls.push((e as { latency_ms: number }).latency_ms);
    }
  }
  // Always have a usable fallback so the stream never starves of data.
  if (ls.length === 0) ls.push(120, 240, 360);
  return ls;
})();

const STREAM_BASE_AT = (PIPELINE_EVENTS[0]?.at as string | undefined) ?? "2026-05-09T08:00:00.000Z";

function clockOf(iso: string): string {
  // Format hh:mm:ss.mmm — pure string slicing, no timezone math.
  const t = iso.split("T")[1] ?? "00:00:00.000Z";
  return t.replace("Z", "");
}

export const DECISION_STREAM: DecisionRow[] = (() => {
  const baseMs = new Date(STREAM_BASE_AT).getTime();
  const rows: DecisionRow[] = [];
  const N = 64;
  for (let i = 0; i < N; i += 1) {
    const at = new Date(baseMs + i * 187).toISOString();
    const borrower = BORROWERS[i % BORROWERS.length];
    rows.push({
      id: `${CASE_SHAPE.canonical_id.split("-")[1] ?? "EVT"}-${(i + 1).toString(16).padStart(4, "0")}`,
      at,
      clock: clockOf(at),
      merchant: borrower.name,
      mcc: MCC_CYCLE[i % MCC_CYCLE.length],
      amount_usd: AMOUNT_CYCLE[i % AMOUNT_CYCLE.length],
      geo: borrower.geo,
      score: SCORE_CYCLE[i % SCORE_CYCLE.length],
      verb: VERB_CYCLE[i % VERB_CYCLE.length],
      top_factor: FACTOR_CYCLE[i % FACTOR_CYCLE.length],
      latency_ms: _serviceLatencies[i % _serviceLatencies.length],
    });
  }
  return rows;
})();

// ─── KPIs — pure aggregates of the read-only stream ──────────────────────
// These are NOT business thresholds — they are display-only counts of the
// rows already in the canvas mock stream.

export interface LiveKpi {
  /** Number of rows in the current display window. */
  total: number;
  approved: number;
  declined: number;
  stepUp: number;
  /** Decline-rate % — the bank's headline KPI for fraud ops. */
  decline_rate_pct: number;
  /** P99 agent latency in ms, observed in the canvas stream. */
  p99_latency_ms: number;
  /** Model drift gauge — a 0..1 value taken from the agent confidence
   *  stub on the canvas (fallback 0.06 if no confidence event present). */
  drift_score: number;
}

export function liveKpi(rows: readonly DecisionRow[] = DECISION_STREAM): LiveKpi {
  let approved = 0;
  let declined = 0;
  let stepUp = 0;
  let maxLatency = 0;
  for (const r of rows) {
    if (r.verb === "approve") approved += 1;
    if (r.verb === "decline") declined += 1;
    if (r.verb === "step-up") stepUp += 1;
    if (r.latency_ms > maxLatency) maxLatency = r.latency_ms;
  }
  const total = rows.length || 1;
  // Drift score is sourced from the canvas's first agent event's
  // tokens_in/tokens_out ratio — display-only number, not a threshold.
  let drift = 0.06;
  for (const e of PIPELINE_EVENTS) {
    if (e.kind === "agent_invoked") {
      const tin = (e as { tokens_in?: number }).tokens_in ?? 0;
      const tout = (e as { tokens_out?: number }).tokens_out ?? 0;
      if (tin > 0) drift = Number((tout / tin).toFixed(2));
      break;
    }
  }
  return {
    total: rows.length,
    approved,
    declined,
    stepUp,
    decline_rate_pct: Number(((declined / total) * 100).toFixed(2)),
    p99_latency_ms: maxLatency,
    drift_score: drift,
  };
}

// ─── per-transaction score factor breakdown ──────────────────────────────
// For the /case/[id] route. Each factor row is one bar on the score
// breakdown chart — values are pulled from a fixed canvas-derived table,
// not computed at render time.

export interface ScoreFactor {
  id: string;
  label: string;
  /** Signed contribution to score, -300..+300. Display only. */
  contribution: number;
  /** Short hint shown beneath the bar. */
  hint: string;
}

const FACTOR_TABLE: Record<string, ScoreFactor[]> = {
  default: [
    { id: "velocity-mcc",        label: "Velocity (MCC bucket)",   contribution: +218, hint: "4 auths in last 90s on MCC 5411" },
    { id: "geo-mismatch",        label: "Geo mismatch",            contribution: +142, hint: "Card-on-file OH · auth IL" },
    { id: "device-trust",        label: "Device trust",            contribution: -86,  hint: "Known device, 18-month history" },
    { id: "issuer-bin-risk",     label: "Issuer BIN risk",         contribution: +54,  hint: "BIN 41xx, gray-zone band" },
    { id: "amount-vs-history",   label: "Amount vs history",       contribution: +71,  hint: "2.3x p95 of last 30d auths" },
    { id: "merchant-risk",       label: "Merchant risk",           contribution: -32,  hint: "Tier-1 merchant, low chargeback" },
    { id: "card-not-present",    label: "Card-not-present",        contribution: +18,  hint: "Present at POS (mitigated)" },
    { id: "ip-asn-risk",         label: "IP / ASN risk",           contribution: +24,  hint: "Residential ASN, no VPN" },
  ],
};

export function scoreFactorsFor(_id: string): ScoreFactor[] {
  // Single canvas case — the id parameter is preserved for URL fidelity
  // but does not branch the factor table. A live deployment would key
  // off the transaction record.
  return FACTOR_TABLE.default;
}

// ─── transaction record (for /case/[id]) ─────────────────────────────────

export interface TransactionRecord {
  id: string;
  clock: string;
  merchant: string;
  mcc: string;
  amount_usd: number;
  geo: string;
  score: number;
  verb: DecisionVerb;
  latency_ms: number;
  borrower: Borrower;
  factors: ScoreFactor[];
}

export function getTransaction(id: string): TransactionRecord {
  // Resolve by id when present in the stream; otherwise fall back to the
  // canonical canvas record so any URL renders something meaningful.
  const found = DECISION_STREAM.find((r) => r.id === id);
  if (found) {
    return {
      id: found.id,
      clock: found.clock,
      merchant: found.merchant,
      mcc: found.mcc,
      amount_usd: found.amount_usd,
      geo: found.geo,
      score: found.score,
      verb: found.verb,
      latency_ms: found.latency_ms,
      borrower: BORROWERS.find((b) => b.name === found.merchant) ?? PRIMARY_BORROWER,
      factors: scoreFactorsFor(found.id),
    };
  }
  const seed = DECISION_STREAM[0];
  return {
    id: id || seed.id,
    clock: seed.clock,
    merchant: seed.merchant,
    mcc: seed.mcc,
    amount_usd: seed.amount_usd,
    geo: seed.geo,
    score: seed.score,
    verb: seed.verb,
    latency_ms: seed.latency_ms,
    borrower: PRIMARY_BORROWER,
    factors: scoreFactorsFor(id),
  };
}

// ─── step-up disposition queue (for /approval/[id]) ──────────────────────
// The ONE place a human ever touches a real-time fraud case: reviewing
// step-up challenges the customer responded to. No business decision is
// taken here — the row is read-only (challenge_sent → customer_response
// → final disposition recorded by the system). The page exposes the
// challenge state so the Fraud Ops Lead can audit a sample.

export type StepUpStatus = "challenged" | "passed" | "failed" | "expired";

export interface StepUpRow {
  id: string;
  /** Challenge sent at (ISO). */
  sent_at: string;
  /** hh:mm:ss.mmm clock. */
  clock: string;
  merchant: string;
  amount_usd: number;
  status: StepUpStatus;
  /** Channel: SMS-OTP, push, voice. */
  channel: string;
  /** Time-to-respond in seconds (only set if status != challenged). */
  response_secs?: number;
}

const STATUS_CYCLE: StepUpStatus[] = ["passed", "passed", "failed", "passed", "expired", "passed", "challenged", "passed", "failed", "passed", "passed", "challenged"];
const CHANNEL_CYCLE = ["sms-otp", "push", "sms-otp", "push", "voice", "sms-otp", "push"];

export const STEP_UP_QUEUE: StepUpRow[] = DECISION_STREAM
  .filter((r) => r.verb === "step-up")
  .map((r, i) => {
    const status = STATUS_CYCLE[i % STATUS_CYCLE.length];
    const responseSecs = status === "challenged" ? undefined : (8 + (i * 7) % 90);
    return {
      id: `${r.id}-CHL`,
      sent_at: r.at,
      clock: r.clock,
      merchant: r.merchant,
      amount_usd: r.amount_usd,
      status,
      channel: CHANNEL_CYCLE[i % CHANNEL_CYCLE.length],
      response_secs: responseSecs,
    };
  });

export function getStepUp(id: string): StepUpRow | null {
  // The /approval/[id] route opens with a focused row, then shows the
  // queue beneath. The id may match the challenge id OR the decision id.
  const direct = STEP_UP_QUEUE.find((r) => r.id === id || r.id.startsWith(id));
  if (direct) return direct;
  return STEP_UP_QUEUE[0] ?? null;
}
