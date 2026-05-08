/**
 * Watchlist composition for the CCO. Pulls together:
 *   - borrowers in risk band 2+ (from borrower_master)
 *   - in-flight applications with substandard DSCR
 *   - covenant-related rule declines (from application_events)
 *   - single-borrower exposure within 1pp of the lending limit
 *
 * Returns one row per concern; a borrower may surface multiple times if they
 * trip multiple triggers — that's intentional, the CCO wants to see each.
 */

import { getPool } from "@/lib/db";
import { TIER1_CAPITAL_USD, SINGLE_BORROWER_HARD_LIMIT_PCT } from "@/lib/bank-config";
import { getBorrowerExposures, type BorrowerExposure } from "./portfolio-data";

export type ConcernSeverity = "high" | "medium" | "low";

export interface WatchlistEntry {
  /** Stable composite key so React can reconcile. */
  key: string;
  borrower_id: string;
  borrower_name: string;
  concern: string;
  /** Plain-English citation/explanation. */
  detail: string;
  severity: ConcernSeverity;
  /** ISO timestamp of the most recent activity that drove this row. */
  last_activity_at: string;
  /** Optional case to open; otherwise the action is "schedule outreach". */
  application_id?: string;
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

const isoOrNow = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return new Date().toISOString();
};

/** Borrowers whose master rating is band 2 or worse. */
function fromRating(borrowers: BorrowerExposure[]): WatchlistEntry[] {
  const out: WatchlistEntry[] = [];
  for (const b of borrowers) {
    if (!b.risk_rating || b.risk_rating.startsWith("1")) continue;
    const severity: ConcernSeverity =
      b.risk_rating.startsWith("3") || b.risk_rating.startsWith("4") || b.risk_rating.startsWith("5")
        ? "high"
        : "medium";
    out.push({
      key: `rating-${b.borrower_id}`,
      borrower_id: b.borrower_id,
      borrower_name: b.legal_name,
      concern: "Rated below pass",
      detail: `Internal rating ${b.risk_rating.replace(/^(\d)-(.+)$/, "$1 · $2")}; review the most recent annual.`,
      severity,
      last_activity_at: new Date().toISOString(),
    });
  }
  return out;
}

/** In-flight applications where DSCR is in the substandard band. */
async function fromDscr(): Promise<WatchlistEntry[]> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT application_id, borrower_id, borrower_name, dscr_base, last_event_at
     FROM application_state
     WHERE dscr_base IS NOT NULL AND dscr_base < 1.20
     ORDER BY dscr_base ASC, last_event_at DESC
     LIMIT 50`,
  );
  return r.rows.map((row) => {
    const dscr = num(row.dscr_base);
    return {
      key: `dscr-${row.application_id}`,
      borrower_id: String(row.borrower_id),
      borrower_name: String(row.borrower_name),
      concern: "Thin debt-service coverage",
      detail: `Latest DSCR ${dscr.toFixed(2)}x — below the 1.20x policy floor (12 CFR 30 appendix A).`,
      severity: dscr < 1.0 ? "high" : "medium",
      last_activity_at: isoOrNow(row.last_event_at),
      application_id: String(row.application_id),
    };
  });
}

/**
 * Covenant declines surfaced by the rules-service. We look for events whose
 * payload says decision='DECLINE' and reason mentions a covenant rule.
 */
async function fromCovenants(): Promise<WatchlistEntry[]> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT
        ae.application_id,
        s.borrower_id,
        s.borrower_name,
        ae.payload,
        ae.occurred_at
     FROM application_events ae
     JOIN application_state s USING (application_id)
     WHERE ae.event_type = 'rule_evaluated'
       AND ae.payload ->> 'decision' = 'DECLINE'
       AND COALESCE(ae.payload ->> 'rule_set', '') ILIKE '%covenant%'
     ORDER BY ae.occurred_at DESC
     LIMIT 50`,
  );
  return r.rows.map((row) => {
    const reason =
      (row.payload && typeof row.payload === "object"
        ? String((row.payload as Record<string, unknown>).reason ?? "")
        : "") || "Covenant breach indicated by rules engine.";
    return {
      key: `cov-${row.application_id}`,
      borrower_id: String(row.borrower_id),
      borrower_name: String(row.borrower_name),
      concern: "Covenant breach detected",
      detail: reason,
      severity: "high" as const,
      last_activity_at: isoOrNow(row.occurred_at),
      application_id: String(row.application_id),
    };
  });
}

/** Borrowers whose committed exposure is within 1pp of the 12 CFR 32 limit. */
function fromConcentration(borrowers: BorrowerExposure[]): WatchlistEntry[] {
  const limitDollars = TIER1_CAPITAL_USD * (SINGLE_BORROWER_HARD_LIMIT_PCT / 100);
  const watchFloor = TIER1_CAPITAL_USD * ((SINGLE_BORROWER_HARD_LIMIT_PCT - 1) / 100);
  const out: WatchlistEntry[] = [];
  for (const b of borrowers) {
    if (b.committed_usd < watchFloor) continue;
    const pct = (b.committed_usd / TIER1_CAPITAL_USD) * 100;
    out.push({
      key: `conc-${b.borrower_id}`,
      borrower_id: b.borrower_id,
      borrower_name: b.legal_name,
      concern: "Approaching single-borrower limit",
      detail: `Committed ${pct.toFixed(2)}% of Tier 1 — within 1pp of the 12 CFR 32 ceiling (${SINGLE_BORROWER_HARD_LIMIT_PCT}%).`,
      severity: b.committed_usd >= limitDollars ? "high" : "medium",
      last_activity_at: new Date().toISOString(),
    });
  }
  return out;
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const borrowers = await getBorrowerExposures();
  const [dscr, covenants] = await Promise.all([fromDscr(), fromCovenants()]);
  const all = [
    ...fromRating(borrowers),
    ...dscr,
    ...covenants,
    ...fromConcentration(borrowers),
  ];
  // Stable sort by severity (high first) then most-recent activity.
  const sevRank = { high: 0, medium: 1, low: 2 };
  all.sort((a, b) => {
    const s = sevRank[a.severity] - sevRank[b.severity];
    if (s !== 0) return s;
    return b.last_activity_at.localeCompare(a.last_activity_at);
  });
  return all;
}

export async function getRecentPortfolioActivity(
  limit = 10,
): Promise<
  Array<{
    id: number;
    application_id: string;
    borrower_name: string;
    event_type: string;
    summary: string;
    occurred_at: string;
  }>
> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT ae.id, ae.application_id, s.borrower_name, ae.event_type, ae.payload, ae.occurred_at
     FROM application_events ae
     JOIN application_state s USING (application_id)
     WHERE ae.event_type IN ('decision_made', 'sink_completed')
     ORDER BY ae.occurred_at DESC
     LIMIT $1`,
    [limit],
  );
  return r.rows.map((row) => {
    const p = (row.payload ?? {}) as Record<string, unknown>;
    let summary = "";
    if (row.event_type === "decision_made") {
      const decision = String(p.decision ?? "—");
      summary = `Decision · ${decision.toLowerCase().replace(/_/g, " ")}`;
    } else if (row.event_type === "sink_completed") {
      const sink = String(p.sink ?? p.sink_name ?? "downstream sink");
      summary = `Posted to ${sink}`;
    } else {
      summary = String(row.event_type);
    }
    return {
      id: Number(row.id),
      application_id: String(row.application_id),
      borrower_name: String(row.borrower_name),
      event_type: String(row.event_type),
      summary,
      occurred_at: isoOrNow(row.occurred_at),
    };
  });
}
