// Option C — decline-reason-actionable view for payment-fraud-scoring-test.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. Adapters BELOW the re-export bar are pure shape
// transforms (event → decline row, decline → tune-action) — no business
// logic, no math, no thresholds invented in TypeScript.

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

// Canvas SHA-256 pinned in the task directive — kept verbatim alongside
// the generated CANVAS_SHA256 so the manifest's "canvas_checksum:
// verbatim" requirement is satisfied even if the generator regenerates
// the fixture.
export const SEED_CANVAS_SHA256 =
  "cc47591b9d1241218f08426d1f4ca8be84cd1b6cb4cb31bc23066ab2f9e80c5f";

// ─── decline reasons (pure copy table — no thresholds) ──────────────────
// These reasons mirror the canvas: 1 agent (gray-zone-fraud-scorer),
// 2 services (industry-risk-scorer, peer-and-industry-context). The
// "reason" is what the fraud-scoring agent or rule emitted; the
// "actionable" affordance is what the analyst can do about it. No
// business logic, no decision math — display + onClick stubs only.

export type DeclineReasonId =
  | "score_above_threshold"
  | "velocity_burst"
  | "merchant_high_risk"
  | "geo_mismatch"
  | "device_new_to_account"
  | "industry_risk_outlier"
  | "peer_pattern_anomaly"
  | "model_confidence_low";

export type TuneActionKind =
  | "override_for_customer"
  | "add_to_allowlist"
  | "tune_threshold"
  | "step_up_for_review";

export interface TuneAction {
  kind: TuneActionKind;
  /** Banker-readable label for the affordance, e.g. "Override · this customer" */
  label: string;
  /** What clicking it would do, in one short phrase */
  effect: string;
}

export interface DeclineReason {
  id: DeclineReasonId;
  /** Banker-readable headline ("Velocity burst", "Merchant high-risk") */
  label: string;
  /** Source of the signal: agent | service | rule */
  source: "agent" | "service" | "rule";
  /** The id of the agent/service/rule that emitted the signal */
  sourceId: string;
  /** One-line explanation for the analyst */
  explanation: string;
  /** Ordered list of actions the analyst can take inline */
  actions: TuneAction[];
}

// Adapter: from the agent / service / rule context in the canvas, project
// the reason and the actions available for it. Static map — display only.
export const DECLINE_REASONS: Record<DeclineReasonId, DeclineReason> = {
  score_above_threshold: {
    id: "score_above_threshold",
    label: "Fraud score above decline threshold",
    source: "agent",
    sourceId: "gray-zone-fraud-scorer",
    explanation:
      "Model returned a score above the configured decline cut-off for this corridor.",
    actions: [
      {
        kind: "override_for_customer",
        label: "Override · this customer",
        effect: "Force approve and pin a customer-scoped allow for 24h",
      },
      {
        kind: "tune_threshold",
        label: "Tune · decline threshold",
        effect: "Open the threshold tuner for this corridor in a side panel",
      },
      {
        kind: "step_up_for_review",
        label: "Step-up · 3DS",
        effect: "Route to 3DS challenge instead of an outright decline",
      },
    ],
  },
  velocity_burst: {
    id: "velocity_burst",
    label: "Velocity burst",
    source: "rule",
    sourceId: "velocity_window_60s",
    explanation:
      "Multiple authorizations on this PAN within the 60-second velocity window.",
    actions: [
      {
        kind: "override_for_customer",
        label: "Override · this customer",
        effect: "Mark the burst as legitimate (e.g. travel · self-service)",
      },
      {
        kind: "tune_threshold",
        label: "Tune · velocity window",
        effect: "Adjust the velocity threshold for this segment",
      },
    ],
  },
  merchant_high_risk: {
    id: "merchant_high_risk",
    label: "Merchant flagged high-risk",
    source: "service",
    sourceId: "industry-risk-scorer",
    explanation:
      "industry-risk-scorer returned an elevated risk band for the merchant MCC.",
    actions: [
      {
        kind: "add_to_allowlist",
        label: "Allowlist · this merchant",
        effect: "Pin this merchant to the bank-wide allow list",
      },
      {
        kind: "tune_threshold",
        label: "Tune · MCC risk band",
        effect: "Open the MCC risk band rule for review",
      },
    ],
  },
  geo_mismatch: {
    id: "geo_mismatch",
    label: "Geo mismatch",
    source: "service",
    sourceId: "peer-and-industry-context",
    explanation:
      "Authorization geo is outside the customer's typical corridor (peer-and-industry-context).",
    actions: [
      {
        kind: "override_for_customer",
        label: "Override · this customer",
        effect: "Accept a one-time travel mismatch for this customer",
      },
      {
        kind: "step_up_for_review",
        label: "Step-up · 3DS",
        effect: "Route to 3DS challenge",
      },
    ],
  },
  device_new_to_account: {
    id: "device_new_to_account",
    label: "Device new to account",
    source: "rule",
    sourceId: "device_fingerprint_first_seen",
    explanation:
      "Device fingerprint not previously seen for this account in the last 90 days.",
    actions: [
      {
        kind: "override_for_customer",
        label: "Override · this customer",
        effect: "Bind the device to the customer (lowers future friction)",
      },
      {
        kind: "step_up_for_review",
        label: "Step-up · 3DS",
        effect: "Route to 3DS challenge",
      },
    ],
  },
  industry_risk_outlier: {
    id: "industry_risk_outlier",
    label: "Industry risk outlier",
    source: "service",
    sourceId: "industry-risk-scorer",
    explanation:
      "Transaction sits outside the industry-risk-scorer cluster for this segment.",
    actions: [
      {
        kind: "tune_threshold",
        label: "Tune · industry threshold",
        effect: "Adjust the industry-risk-scorer cut-off for this segment",
      },
      {
        kind: "add_to_allowlist",
        label: "Allowlist · this merchant",
        effect: "Pin this merchant to the allow list",
      },
    ],
  },
  peer_pattern_anomaly: {
    id: "peer_pattern_anomaly",
    label: "Peer pattern anomaly",
    source: "service",
    sourceId: "peer-and-industry-context",
    explanation:
      "peer-and-industry-context flagged the spend pattern as anomalous for the peer cluster.",
    actions: [
      {
        kind: "override_for_customer",
        label: "Override · this customer",
        effect: "Accept the anomaly for this customer",
      },
      {
        kind: "tune_threshold",
        label: "Tune · peer-anomaly sensitivity",
        effect: "Adjust the peer-anomaly sensitivity for this peer cluster",
      },
    ],
  },
  model_confidence_low: {
    id: "model_confidence_low",
    label: "Model confidence low (gray zone)",
    source: "agent",
    sourceId: "gray-zone-fraud-scorer",
    explanation:
      "Model is in the gray zone (between approve and decline confidence bands).",
    actions: [
      {
        kind: "step_up_for_review",
        label: "Step-up · 3DS",
        effect: "Route to 3DS challenge instead of decline",
      },
      {
        kind: "tune_threshold",
        label: "Tune · gray-zone band",
        effect: "Adjust the gray-zone band for this corridor",
      },
    ],
  },
};

// ─── decline stream (synthesized from canvas borrowers + reasons) ──────
// We project each canvas borrower into a single declined transaction with
// one or two reasons. This is a presentation-only mock; values come from
// the canvas fixture (BORROWERS) and the static reason table above.
// Nothing here is computed from PII or runtime data.

export interface DeclineRow {
  id: string;
  /** ISO timestamp — drawn from PIPELINE_EVENTS so timestamps stay
   *  consistent with the canvas. */
  at: string;
  /** Customer label — borrower name from the canvas */
  customer: string;
  /** Merchant label — derived from borrower geo for variety */
  merchant: string;
  /** Authorization amount in USD (display only) */
  amountUsd: number;
  /** Card corridor / MCC label */
  corridor: string;
  /** Fraud score (display only — value comes from the agent stub) */
  score: number;
  /** Reason ids that triggered the decline */
  reasonIds: DeclineReasonId[];
  /** The disposition the system actually took */
  disposition: "decline" | "step-up" | "approve";
}

// Pin a stable timestamp anchor from the canvas events so the table
// timestamps don't drift between renders.
const ANCHOR_AT =
  PIPELINE_EVENTS.find((e) => e.kind === "agent_invoked")?.at ??
  PIPELINE_EVENTS[0]?.at ??
  "2026-05-09T08:01:13.000Z";

function tweakClock(base: string, seconds: number): string {
  const d = new Date(base);
  d.setSeconds(d.getSeconds() + seconds);
  return d.toISOString();
}

// Hand-shaped reason patterns per borrower — display-only, no math.
const DECLINE_PATTERN: Array<{
  reasons: DeclineReasonId[];
  amount: number;
  corridor: string;
  merchant: string;
  score: number;
  disposition: DeclineRow["disposition"];
}> = [
  { reasons: ["score_above_threshold", "velocity_burst"], amount: 2847, corridor: "POS · US", merchant: "Walmart Supercenter", score: 0.91, disposition: "decline" },
  { reasons: ["merchant_high_risk"], amount: 412, corridor: "CNP · US", merchant: "FastCash Online", score: 0.78, disposition: "decline" },
  { reasons: ["geo_mismatch", "device_new_to_account"], amount: 1180, corridor: "POS · ATL", merchant: "Esso Roma", score: 0.74, disposition: "step-up" },
  { reasons: ["model_confidence_low"], amount: 95, corridor: "CNP · US", merchant: "Spotify Subscription", score: 0.58, disposition: "step-up" },
  { reasons: ["industry_risk_outlier", "peer_pattern_anomaly"], amount: 6210, corridor: "ACH · US", merchant: "Crypto Bridge LLC", score: 0.83, disposition: "decline" },
  { reasons: ["velocity_burst"], amount: 220, corridor: "POS · US", merchant: "Speedway #4421", score: 0.66, disposition: "decline" },
  { reasons: ["score_above_threshold"], amount: 14000, corridor: "Wire · US-DE", merchant: "Auto Trader DE", score: 0.94, disposition: "decline" },
  { reasons: ["geo_mismatch"], amount: 88, corridor: "CNP · US-JP", merchant: "Lawson Tokyo", score: 0.69, disposition: "step-up" },
  { reasons: ["merchant_high_risk", "model_confidence_low"], amount: 540, corridor: "POS · US", merchant: "Bet365", score: 0.71, disposition: "decline" },
  { reasons: ["device_new_to_account"], amount: 240, corridor: "CNP · US", merchant: "Apple App Store", score: 0.62, disposition: "step-up" },
];

export const LIVE_DECLINES: DeclineRow[] = BORROWERS.slice(0, DECLINE_PATTERN.length).map(
  (b, i) => {
    const p = DECLINE_PATTERN[i];
    return {
      id: `EVT-${1715350200 + i * 7}-${b.id.toLowerCase()}`,
      at: tweakClock(ANCHOR_AT, i * 9),
      customer: b.name,
      merchant: p.merchant,
      amountUsd: p.amount,
      corridor: p.corridor,
      score: p.score,
      reasonIds: p.reasons,
      disposition: p.disposition,
    };
  },
);

export function getDecline(id: string): DeclineRow {
  return LIVE_DECLINES.find((d) => d.id === id) ?? LIVE_DECLINES[0];
}

// ─── decline filter ──────────────────────────────────────────────────────

export type DeclineFilter = "all" | "decline" | "step-up" | "high-score";

export function filterDeclines(
  rows: readonly DeclineRow[],
  f: DeclineFilter,
): DeclineRow[] {
  if (f === "all") return [...rows];
  if (f === "high-score") return rows.filter((r) => r.score >= 0.8);
  return rows.filter((r) => r.disposition === f);
}

// ─── transcript adapter (reused for the case detail page) ──────────────

export type TranscriptActor = "system" | "service" | "agent" | "rule" | "decline";

export interface TranscriptRow {
  idx: number;
  at: string;
  actor: TranscriptActor;
  speaker: string;
  headline: string;
  detail?: string;
  ref?: string;
  meta?: { latencyMs?: number; tokensIn?: number; tokensOut?: number; confidence?: number };
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

// Pure shape transform — every PIPELINE_EVENT becomes exactly one row.
// No event is dropped, no event is invented. Order = event order.
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
      case "document_uploaded":
      case "document_extracted":
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
