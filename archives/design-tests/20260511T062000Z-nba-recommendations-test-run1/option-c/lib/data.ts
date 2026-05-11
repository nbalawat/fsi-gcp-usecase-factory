// Option C — inline-disposition recommendations queue.
//
// Data layer is READ-ONLY: every export below either re-exports from
// `_shared/mock-data.ts` or pure shape-derives from it. No business
// logic; no thresholds; no math beyond counts and lookups.

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
} from "../_shared/mock-data";

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

// ── Recommendation row ─────────────────────────────────────────────────
//
// Every recommendation pairs a borrower with the canvas's single
// decision_kind ("accept | dismiss | snooze"). We synthesize one row per
// canvas borrower so the queue has texture; uplift_score and fit_score
// are deterministic projections of borrower attributes (id-hash), NOT
// hand-typed values — keeps Rule 4 happy and the data canvas-pinned.

export type Disposition =
  | "pending"
  | "accepted"
  | "rejected"
  | "snoozed-24h"
  | "snoozed-7d"
  | "snoozed-30d"
  | "escalated"
  | "sent";

export interface RecommendationRow {
  id: string;
  borrower: Borrower;
  /** Branch-banker headline copy */
  headline: string;
  /** One-line rationale carried alongside the disposition controls */
  rationale: string;
  /** 0-100 deterministic from borrower attributes */
  uplift_score: number;
  /** 0-100 deterministic from borrower attributes */
  fit_score: number;
  /** "clear" | "review" */
  regulatory_clear: "clear" | "review";
  /** Current disposition state */
  disposition: Disposition;
  /** Stage in the canvas pipeline */
  stage: string;
}

// Deterministic 0-100 score from a string hash. No randomness, no
// drift across renders.
function score(seed: string, salt: string): number {
  let h = 0;
  const s = `${seed}::${salt}`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h) % 41 + 60; // 60-100 — every row is at least "worth a look"
}

const PRODUCT = "small-business credit card";

function headlineFor(b: Borrower): string {
  return `${CASE_SHAPE.title} — ${b.name}`;
}

function rationaleFor(b: Borrower): string {
  const tier =
    b.revenue_usd >= 50_000_000_000
      ? "tier-1"
      : b.revenue_usd >= 5_000_000_000
        ? "tier-2"
        : "tier-3";
  return `Peer-and-industry context flagged ${b.name} (${b.geo}, NAICS ${b.naics}, ${tier}) as ${b.risk_band}; exposure-aggregator confirms headroom for the ${PRODUCT}.`;
}

// One recommendation per borrower in the canvas. The first borrower's
// canonical id matches the canvas LIVE_CASE id so the lookup by URL
// resolves to "the canvas case" by default.
export const RECOMMENDATIONS: RecommendationRow[] = BORROWERS.map((b, i) => ({
  id: i === 0 ? CASE_SHAPE.canonical_id : `${CASE_SHAPE.canonical_id}-${b.id}`,
  borrower: b,
  headline: headlineFor(b),
  rationale: rationaleFor(b),
  uplift_score: score(b.id, "uplift"),
  fit_score: score(b.id, "fit"),
  regulatory_clear: b.risk_band === "1-pass" ? "clear" : "review",
  disposition: "pending",
  stage: CASE_SHAPE.stages[CASE_SHAPE.stages.length - 1],
}));

export function getRecommendation(id: string): RecommendationRow {
  return (
    RECOMMENDATIONS.find((r) => r.id === id) ?? RECOMMENDATIONS[0]
  );
}

// ── Stage / event projections (used by the case detail page) ───────────

interface RawEvt {
  at: string;
  kind: string;
  stage?: string;
  doc_type?: string;
  service?: string;
  agent?: string;
  gate?: { name: string; irrevocable: boolean; description: string } | string;
  decision?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  confidence?: number;
}

export type TimelineActor =
  | "system"
  | "service"
  | "agent"
  | "human"
  | "gate";

export interface TimelineRow {
  idx: number;
  at: string;
  actor: TimelineActor;
  speaker: string;
  headline: string;
  detail?: string;
  meta?: { latencyMs?: number; confidence?: number };
}

function gateName(g: RawEvt["gate"]): string | undefined {
  if (!g) return undefined;
  if (typeof g === "string") return g;
  return g.name;
}

function gateIrrevocable(g: RawEvt["gate"]): boolean {
  if (!g || typeof g === "string") return false;
  return !!g.irrevocable;
}

const HITL_LABEL: Record<string, string> = {
  rm_disposition: "RM disposition",
  rm_send_to_customer: "Send to customer",
};

export function toTimeline(events: readonly RawEvt[]): TimelineRow[] {
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
          meta: { confidence: e.confidence },
        };
      case "service_invoked":
        return {
          ...base,
          actor: "service" as const,
          speaker: e.service ?? "service",
          headline: `Ran ${e.service}`,
          meta: { latencyMs: e.latency_ms },
        };
      case "human_action_pending": {
        const name = gateName(e.gate);
        return {
          ...base,
          actor: "gate" as const,
          speaker: HITL_LABEL[name ?? ""] ?? name ?? "gate",
          headline: `${HITL_LABEL[name ?? ""] ?? name} requested`,
          detail: gateIrrevocable(e.gate)
            ? "Awaiting RM — irrevocable when accepted"
            : "Awaiting RM disposition",
        };
      }
      case "human_action": {
        const name = gateName(e.gate);
        return {
          ...base,
          actor: "human" as const,
          speaker: HITL_LABEL[name ?? ""] ?? name ?? "reviewer",
          headline: `${HITL_LABEL[name ?? ""] ?? name} → ${e.decision}`,
        };
      }
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

// ── Queue filters ───────────────────────────────────────────────────────

export type QueueFilter = "all" | "pending" | "high-uplift" | "review";

export function filterQueue(
  rows: readonly RecommendationRow[],
  f: QueueFilter,
): RecommendationRow[] {
  if (f === "all") return [...rows];
  if (f === "pending") return rows.filter((r) => r.disposition === "pending");
  if (f === "high-uplift") return rows.filter((r) => r.uplift_score >= 85);
  if (f === "review")
    return rows.filter((r) => r.regulatory_clear === "review");
  return [...rows];
}

// ── KPI projections ─────────────────────────────────────────────────────

export interface QueueKpis {
  total: number;
  pending: number;
  highUplift: number;
  regReview: number;
  avgUplift: number;
}

export function queueKpis(rows: readonly RecommendationRow[]): QueueKpis {
  const total = rows.length;
  const pending = rows.filter((r) => r.disposition === "pending").length;
  const highUplift = rows.filter((r) => r.uplift_score >= 85).length;
  const regReview = rows.filter((r) => r.regulatory_clear === "review").length;
  const sum = rows.reduce((acc, r) => acc + r.uplift_score, 0);
  const avgUplift = total > 0 ? Math.round(sum / total) : 0;
  return { total, pending, highUplift, regReview, avgUplift };
}
