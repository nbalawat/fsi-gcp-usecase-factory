// Option B — model-first view.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. Adapters BELOW the re-export bar are pure shape
// transforms — no business logic, no math the page would re-derive.

import {
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
  BAND_THRESHOLDS,
  CANVAS_SHA256,
  CASE_SHAPE,
  COMPLIANCE_SCOPE,
  DECISION_TALLY,
  FEATURES,
  HITL_GATES,
  LIVE_MODEL,
  MODEL,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  POLICY_THRESHOLDS,
  PRIMARY_SAMPLE,
  RULE_VERDICTS,
  SAMPLES,
  SCORE_HISTOGRAM,
  SHARED_RULES,
  USE_CASE_ID,
  type FeatureContribution,
  type FeatureSpec,
  type ModelIdentity,
  type PolicyThreshold,
  type Sample,
  type ScoreBucket,
} from "../../_shared/mock-data";

export {
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
  BAND_THRESHOLDS,
  CANVAS_SHA256,
  CASE_SHAPE,
  COMPLIANCE_SCOPE,
  DECISION_TALLY,
  FEATURES,
  HITL_GATES,
  LIVE_MODEL,
  MODEL,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  POLICY_THRESHOLDS,
  PRIMARY_SAMPLE,
  RULE_VERDICTS,
  SAMPLES,
  SCORE_HISTOGRAM,
  SHARED_RULES,
  USE_CASE_ID,
};

export type {
  FeatureContribution,
  FeatureSpec,
  ModelIdentity,
  PolicyThreshold,
  Sample,
  ScoreBucket,
};

// ─── Sample lookup (one transaction = one sample on the curve) ──────────

export function getSample(id: string): Sample {
  const hit = SAMPLES.find((s) => s.id === id);
  return hit ?? PRIMARY_SAMPLE;
}

// Total count across the histogram, used by the page to render rate
// labels next to bucket bars without re-computing per render.
export function totalSampleCount(): number {
  let n = 0;
  for (const b of SCORE_HISTOGRAM) n += b.count;
  return n;
}

// Highest bucket count — used for bar normalisation in HistogramBar.
export function maxBucketCount(): number {
  let m = 0;
  for (const b of SCORE_HISTOGRAM) if (b.count > m) m = b.count;
  return m;
}

// Bucket index a given score falls in (right-open interval). Pure lookup.
export function bucketIndexForScore(score: number): number {
  if (score >= 1) return SCORE_HISTOGRAM.length - 1;
  if (score < 0) return 0;
  return Math.min(
    SCORE_HISTOGRAM.length - 1,
    Math.floor(score / 0.05),
  );
}

// ─── Feature filters (drives the model-health hero left rail) ───────────

export type FeatureFilter =
  | "all"
  | "velocity"
  | "geo"
  | "device"
  | "merchant"
  | "amount"
  | "tenure";

export function filterFeatures(
  features: readonly FeatureSpec[],
  f: FeatureFilter,
): FeatureSpec[] {
  if (f === "all") return [...features];
  return features.filter((x) => x.group === f);
}

// ─── Policy diff (for the approval / tuning route) ──────────────────────
// Pure shape: given a proposed value, return the deltas the page will
// render. No risk calculation, no business decision — just a labeled
// pre-formatted view. The actual policy commit is out of scope.

export interface PolicyDiff {
  id: string;
  rule: string;
  param: string;
  mcc?: string;
  current: number;
  proposed: number;
  delta: number;
  unit: string;
  curve_at_current: number;
}

export function diffPolicy(
  threshold: PolicyThreshold,
  proposed: number,
): PolicyDiff {
  return {
    id: threshold.id,
    rule: threshold.rule,
    param: threshold.param,
    mcc: threshold.mcc,
    current: threshold.current,
    proposed,
    delta: proposed - threshold.current,
    unit: threshold.unit,
    curve_at_current: threshold.champion_curve_at_current,
  };
}

// ─── Live-event row shape (used by the small live ticker) ───────────────

export type EventActor = "system" | "service" | "agent" | "score" | "decision";

export interface LiveEventRow {
  idx: number;
  at: string;
  actor: EventActor;
  speaker: string;
  headline: string;
  ref?: string;
  meta?: {
    latencyMs?: number;
    tokensIn?: number;
    tokensOut?: number;
    confidence?: number;
    score?: number;
    band?: string;
  };
}

interface RawEvt {
  at: string;
  kind: string;
  stage?: string;
  service?: string;
  agent?: string;
  score?: number;
  band?: string;
  decision?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  confidence?: number;
}

export function toLiveEvents(events: readonly RawEvt[]): LiveEventRow[] {
  return events.map((e, idx) => {
    const base = { idx, at: e.at };
    switch (e.kind) {
      case "stage_entered":
        return {
          ...base,
          actor: "system" as const,
          speaker: "pipeline",
          headline: `Stage ${e.stage}`,
        };
      case "service_invoked":
        return {
          ...base,
          actor: "service" as const,
          speaker: e.service ?? "service",
          headline: `${e.service} ran`,
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
          meta: {
            tokensIn: e.tokens_in,
            tokensOut: e.tokens_out,
            confidence: e.confidence,
          },
        };
      case "score_emitted":
        return {
          ...base,
          actor: "score" as const,
          speaker: "scorer",
          headline: `score ${e.score?.toFixed(2)} · ${e.band}`,
          meta: { score: e.score, band: e.band },
        };
      case "decision_emitted":
        return {
          ...base,
          actor: "decision" as const,
          speaker: "decider",
          headline: `decision ${e.decision}`,
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

// ─── Verdict → badge tone (pure mapping) ────────────────────────────────

export function verdictBadge(
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
}

export function bandBadge(
  b: "approve" | "gray" | "decline",
): "success" | "warning" | "danger" {
  if (b === "approve") return "success";
  if (b === "gray") return "warning";
  return "danger";
}
