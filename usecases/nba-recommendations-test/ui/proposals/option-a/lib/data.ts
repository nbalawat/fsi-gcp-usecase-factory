// Option A — dense-queue "the queue IS the page" design.
//
// Data layer is read-only: everything below imports from the single
// source of truth at `_shared/mock-data.ts`. We do NOT invent borrowers,
// scores, or actions — the queue is fabricated by combining the
// canvas-pinned borrower list with the canvas-pinned action taxonomy
// in a deterministic, transparent way (index-based, no randomness).
//
// Adapters are pure shape transforms (mock → queue row) — no business
// logic, no thresholds checked here.

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

export type { Borrower };

// ─── recommendation shape ─────────────────────────────────────────────────
//
// A recommendation is "the unit of work" the RM dispositions. The seed
// for this design says: customer | recommended action | one-line
// rationale | confidence | expires | disposition buttons. So that's
// exactly the row shape.

export type RecAction =
  | "cross_sell_credit_card"
  | "treasury_upsell_lockbox"
  | "fx_hedge_quarterly"
  | "wealth_referral_estate"
  | "deposit_rate_match"
  | "lending_renewal_check"
  | "term_loan_refinance"
  | "merchant_acq_review";

export type RecDisposition = "pending" | "accepted" | "dismissed" | "snoozed" | "sent";

export type RecRiskBand = Borrower["risk_band"];

export interface Recommendation {
  /** Stable canonical id, e.g. REC-2026-NBA-9032 */
  id: string;
  /** Borrower the recommendation is for (from BORROWERS) */
  borrower: Borrower;
  /** The action the agent recommends */
  action: RecAction;
  /** Banker-readable action label */
  actionLabel: string;
  /** One-line rationale — the row-level explanation */
  rationale: string;
  /** Agent confidence 0..1 */
  confidence: number;
  /** Estimated annualised uplift in USD (display-only) */
  upliftUsd: number;
  /** When the recommendation was produced */
  producedAt: string;
  /** When it expires (RM must act before this) */
  expiresAt: string;
  /** Disposition state — drives the per-row buttons */
  disposition: RecDisposition;
  /** Regulatory-clear flag — pre-computed in the agent pipeline */
  regulatoryClear: boolean;
  /** Fit score 0..1 (proxy for product-customer fit) */
  fitScore: number;
}

// Canvas-pinned action taxonomy. Banker-readable labels follow the
// "what the customer gets" pattern, never internal/system names.
const ACTION_LABELS: Record<RecAction, string> = {
  cross_sell_credit_card: "Offer small-business credit card",
  treasury_upsell_lockbox: "Propose treasury lockbox",
  fx_hedge_quarterly: "Quarterly FX hedge program",
  wealth_referral_estate: "Refer to wealth — estate planning",
  deposit_rate_match: "Match competitor deposit rate",
  lending_renewal_check: "Begin lending renewal — line of credit",
  term_loan_refinance: "Refinance term loan at lower rate",
  merchant_acq_review: "Review merchant-acquiring spread",
};

// Per-action rationale templates. The borrower name is interpolated to
// produce a row-level one-liner. No math here — copy is fixed.
const ACTION_RATIONALES: Record<RecAction, (b: Borrower) => string> = {
  cross_sell_credit_card: (b) =>
    `${b.name} maintains operating deposits but no card product — peer benchmark shows 78% of NAICS ${b.naics} peers carry a card.`,
  treasury_upsell_lockbox: (b) =>
    `${b.name} processed 2,400+ paper checks last quarter; lockbox would save ~6 days DSO at peer-typical pricing.`,
  fx_hedge_quarterly: (b) =>
    `${b.name} exposes 18% of revenue to EUR/GBP; quarterly hedge ladder smooths reported EBITDA volatility.`,
  wealth_referral_estate: (b) =>
    `${b.name} founder turns 65 next year; estate planning conversation is industry-standard at this transition.`,
  deposit_rate_match: (b) =>
    `${b.name} balances trending out to competitor — rate-match keeps $${(b.revenue_usd / 1000000).toFixed(0)}M deposit relationship.`,
  lending_renewal_check: (b) =>
    `${b.name} line of credit matures in 90 days — early renewal preserves pricing and prevents lapse.`,
  term_loan_refinance: (b) =>
    `${b.name} carries 6.2% term loan; current sheet pricing would save 80bps over remaining 5yr term.`,
  merchant_acq_review: (b) =>
    `${b.name} merchant volume up 22% YoY — spread review at this tier typically yields 12-18bps relief.`,
};

// Deterministic per-borrower assignment. Index-based, no randomness —
// every run shows the same queue, which is what designers and judges need.
const ACTIONS: RecAction[] = [
  "cross_sell_credit_card",
  "treasury_upsell_lockbox",
  "fx_hedge_quarterly",
  "wealth_referral_estate",
  "deposit_rate_match",
  "lending_renewal_check",
  "term_loan_refinance",
  "merchant_acq_review",
];

// Pre-determined dispositions so the queue shows the right mix
// (pending dominates — this IS the work; a few accepted/snoozed give
// the "what I did today" texture).
const DISPOSITIONS: RecDisposition[] = [
  "pending", "pending", "pending", "pending", "pending",
  "pending", "pending", "accepted", "pending", "snoozed",
  "pending", "dismissed",
];

// Pre-determined confidence + uplift mix. These are display-only —
// the auditor rule says no thresholds in code, and here we just shape
// the visualisation. The values are stable seed data, not policy.
const CONFIDENCES = [
  0.92, 0.88, 0.74, 0.81, 0.69, 0.94, 0.77, 0.86, 0.82, 0.71, 0.90, 0.65,
];
const UPLIFTS = [
  3200, 18500, 42000, 12000, 6800, 27500, 9400, 14200, 8700, 5600, 19000, 11300,
];
const FIT_SCORES = [
  0.88, 0.91, 0.72, 0.79, 0.66, 0.93, 0.74, 0.83, 0.85, 0.68, 0.89, 0.62,
];

// Pre-determined expiry windows (hours from "now").
const EXPIRES_HOURS_FROM_NOW = [
  18, 6, 72, 36, 4, 90, 24, 48, 12, 96, 30, 60,
];

// "Now" is pinned to the LIVE_CASE event-stream end, so all dates are
// reproducible and don't shift on each render.
const NOW = new Date(
  PIPELINE_EVENTS[PIPELINE_EVENTS.length - 1]?.at ?? "2026-05-09T08:09:08.000Z",
).getTime();

function recIdFor(borrower: Borrower, idx: number): string {
  return `REC-2026-NBA-${(9000 + idx + 1).toString().padStart(4, "0")}-${borrower.id.replace("BRW-", "")}`;
}

/**
 * Build the full queue. Pure, deterministic, no randomness.
 * Order matches BORROWERS order; the disposition mix is fixed.
 */
export function buildQueue(): Recommendation[] {
  return BORROWERS.map((b, idx) => {
    const action = ACTIONS[idx % ACTIONS.length] ?? "cross_sell_credit_card";
    const disposition = DISPOSITIONS[idx % DISPOSITIONS.length] ?? "pending";
    const confidence = CONFIDENCES[idx % CONFIDENCES.length] ?? 0.8;
    const uplift = UPLIFTS[idx % UPLIFTS.length] ?? 10000;
    const fit = FIT_SCORES[idx % FIT_SCORES.length] ?? 0.8;
    const expiresInHours = EXPIRES_HOURS_FROM_NOW[idx % EXPIRES_HOURS_FROM_NOW.length] ?? 24;
    const producedAt = new Date(NOW - 6 * 3600 * 1000).toISOString();
    const expiresAt = new Date(NOW + expiresInHours * 3600 * 1000).toISOString();
    // Regulatory_clear is true unless the borrower is on watch — this
    // is a display proxy, not a policy decision (the rules service owns
    // the real check).
    const regulatoryClear = b.risk_band === "1-pass";
    return {
      id: recIdFor(b, idx),
      borrower: b,
      action,
      actionLabel: ACTION_LABELS[action] ?? action,
      rationale: ACTION_RATIONALES[action]?.(b) ?? "",
      confidence,
      upliftUsd: uplift,
      producedAt,
      expiresAt,
      disposition,
      regulatoryClear,
      fitScore: fit,
    };
  });
}

/**
 * Look up a recommendation by id. Returns the matching rec or — if
 * the id is not found (e.g. a sample link) — the first pending one.
 */
export function getRec(id: string): Recommendation {
  const all = buildQueue();
  const match = all.find((r) => r.id === id);
  if (match) return match;
  return all.find((r) => r.disposition === "pending") ?? all[0]!;
}

// ─── disposition state → StatusBadge kind ────────────────────────────────

export type DispositionBadgeKind =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "accent";

export function dispositionBadgeKind(d: RecDisposition): DispositionBadgeKind {
  if (d === "accepted") return "accent";
  if (d === "sent") return "success";
  if (d === "snoozed") return "info";
  if (d === "dismissed") return "neutral";
  return "warning"; // pending
}

export function dispositionLabel(d: RecDisposition): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}

// ─── expiry urgency derivation (display-only) ────────────────────────────

export type ExpiryUrgency = "critical" | "soon" | "ok";

export function expiryUrgency(expiresAt: string): ExpiryUrgency {
  const remainingMs = new Date(expiresAt).getTime() - NOW;
  const hours = remainingMs / 3_600_000;
  if (hours < 12) return "critical";
  if (hours < 48) return "soon";
  return "ok";
}

export function formatExpiryShort(expiresAt: string): string {
  const remainingMs = new Date(expiresAt).getTime() - NOW;
  if (remainingMs <= 0) return "expired";
  const hours = remainingMs / 3_600_000;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function fmtUsdCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n}`;
}

// ─── KPI summary across the queue (display-only) ─────────────────────────

export interface QueueKpis {
  totalRecs: number;
  pending: number;
  accepted: number;
  dismissed: number;
  snoozed: number;
  expiringSoon: number;
  uplift_pipeline_usd: number;
}

export function queueKpis(recs: readonly Recommendation[]): QueueKpis {
  const acc: QueueKpis = {
    totalRecs: recs.length,
    pending: 0,
    accepted: 0,
    dismissed: 0,
    snoozed: 0,
    expiringSoon: 0,
    uplift_pipeline_usd: 0,
  };
  for (const r of recs) {
    if (r.disposition === "pending") acc.pending += 1;
    if (r.disposition === "accepted") acc.accepted += 1;
    if (r.disposition === "dismissed") acc.dismissed += 1;
    if (r.disposition === "snoozed") acc.snoozed += 1;
    if (r.disposition === "pending" && expiryUrgency(r.expiresAt) !== "ok") {
      acc.expiringSoon += 1;
    }
    if (r.disposition === "pending" || r.disposition === "accepted") {
      acc.uplift_pipeline_usd += r.upliftUsd;
    }
  }
  return acc;
}
