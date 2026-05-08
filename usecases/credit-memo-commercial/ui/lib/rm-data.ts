/**
 * Server-side data helpers for the RM persona.
 *   - searchBorrowers   — fuzzy autocomplete against borrower_master.
 *   - getBorrowerById   — full record + current committed exposure.
 *   - prescreenBorrower — three checks the RM runs before submitting:
 *       Reg O insider, single-borrower limit, sector concentration.
 *
 * The pre-screen is computed locally from `loan_facilities` + the seeded
 * `officers_directors` / `principal_shareholders` tables. In production this
 * is the deployed `insider-screening` and `exposure-aggregator` Cloud Run
 * services; for the demo we keep the same shape so the UI swap is one config.
 */

import { getPool } from "@/lib/db";
import {
  TIER1_CAPITAL_USD,
  SINGLE_BORROWER_HARD_LIMIT_PCT,
  SINGLE_BORROWER_WATCH_PCT,
  SECTOR_CELL_BREACH_PCT,
  SECTOR_CELL_WATCH_PCT,
  naicsSector,
  stateRegion,
} from "@/lib/bank-config";
import type { BorrowerExposure } from "./portfolio-data";

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

export interface BorrowerSearchHit {
  borrower_id: string;
  legal_name: string;
  dba_name: string | null;
  ein: string | null;
  naics_code: string | null;
  primary_state: string | null;
  risk_rating: string | null;
  relationship_since: string | null;
  committed_usd: number;
}

/**
 * Lookup borrowers by name, EIN suffix, or borrower_id. We treat DUNS as
 * borrower_id for the demo since the seed doesn't carry a separate DUNS column.
 */
export async function searchBorrowers(q: string, limit = 8): Promise<BorrowerSearchHit[]> {
  const term = q.trim();
  if (term.length === 0) return [];
  const pool = getPool();
  const like = `%${term}%`;
  const r = await pool.query(
    `SELECT
        bm.borrower_id, bm.legal_name, bm.dba_name, bm.ein,
        bm.naics_code, bm.primary_state, bm.risk_rating, bm.relationship_since,
        COALESCE(SUM(lf.committed_usd) FILTER (WHERE lf.status='active'), 0) AS committed_usd
     FROM borrower_master bm
     LEFT JOIN loan_facilities lf ON lf.borrower_id = bm.borrower_id
     WHERE bm.legal_name ILIKE $1
        OR bm.dba_name   ILIKE $1
        OR bm.borrower_id ILIKE $1
        OR COALESCE(bm.ein, '') ILIKE $1
     GROUP BY bm.borrower_id
     ORDER BY bm.legal_name ASC
     LIMIT $2`,
    [like, limit],
  );
  return r.rows.map((row) => ({
    borrower_id: String(row.borrower_id),
    legal_name: String(row.legal_name),
    dba_name: row.dba_name ? String(row.dba_name) : null,
    ein: row.ein ? String(row.ein) : null,
    naics_code: row.naics_code ? String(row.naics_code) : null,
    primary_state: row.primary_state ? String(row.primary_state) : null,
    risk_rating: row.risk_rating ? String(row.risk_rating) : null,
    relationship_since: row.relationship_since
      ? new Date(row.relationship_since).toISOString().slice(0, 10)
      : null,
    committed_usd: num(row.committed_usd),
  }));
}

export interface PrescreenInput {
  borrower_id: string;
  proposed_amount: number;
  facility_type: string;
  term_years: number;
}

export type CheckStatus = "pass" | "warn" | "breach";

export interface CheckResult {
  status: CheckStatus;
  headline: string;
  detail: string;
  /** Optional regulatory citation (e.g. "12 CFR 215") for the inline footnote. */
  citation?: string;
  /** Optional structured number(s) the UI can render in a meter. */
  data?: Record<string, number | string>;
}

export interface PrescreenResult {
  borrower: BorrowerSearchHit;
  proposed_amount: number;
  facility_type: string;
  term_years: number;
  insider: CheckResult;
  single_borrower: CheckResult;
  concentration: CheckResult;
  /** Worst status across the three. */
  overall: CheckStatus;
}

async function checkInsider(borrowerId: string): Promise<CheckResult> {
  const pool = getPool();
  const [officersRes, principalsRes, relatedRes] = await Promise.all([
    pool.query(
      `SELECT role
       FROM officers_directors
       WHERE subject_id = $1 AND (effective_to IS NULL OR effective_to > NOW())
       LIMIT 5`,
      [borrowerId],
    ),
    pool.query(
      `SELECT ownership_pct
       FROM principal_shareholders
       WHERE subject_id = $1 AND (effective_to IS NULL OR effective_to > NOW())
       LIMIT 5`,
      [borrowerId],
    ),
    pool.query(
      `SELECT relationship_type, related_to_id
       FROM related_interests
       WHERE subject_id = $1 AND (effective_to IS NULL OR effective_to > NOW())
       LIMIT 5`,
      [borrowerId],
    ),
  ]);
  const officers = officersRes.rows.length;
  const principals = principalsRes.rows.length;
  const related = relatedRes.rows.length;
  const total = officers + principals + related;
  if (total === 0) {
    return {
      status: "pass",
      headline: "No insider relationships on file",
      detail:
        "Borrower is not flagged as a Reg O officer, director, principal shareholder, or related interest.",
      citation: "12 CFR 215",
    };
  }
  const flavour =
    officers > 0
      ? `${officers} active officer/director link${officers === 1 ? "" : "s"}`
      : principals > 0
        ? `${principals} principal shareholder link${principals === 1 ? "" : "s"}`
        : `${related} related-interest link${related === 1 ? "" : "s"}`;
  return {
    status: "warn",
    headline: "Reg O insider linkage detected",
    detail: `Routing required: ${flavour}. Loan must comply with the comparable-terms test and prior-approval thresholds.`,
    citation: "12 CFR 215",
  };
}

async function getCommittedForBorrower(borrowerId: string): Promise<number> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT COALESCE(SUM(committed_usd), 0) AS committed
     FROM loan_facilities
     WHERE borrower_id = $1 AND status = 'active'`,
    [borrowerId],
  );
  return num(r.rows[0]?.committed ?? 0);
}

function checkSingleBorrower(
  current: number,
  proposed: number,
): CheckResult {
  const newTotal = current + proposed;
  const pct = (newTotal / TIER1_CAPITAL_USD) * 100;
  const limitPct = SINGLE_BORROWER_HARD_LIMIT_PCT;
  if (pct >= limitPct) {
    return {
      status: "breach",
      headline: `Combined exposure ${pct.toFixed(2)}% would breach 12 CFR 32`,
      detail: `Existing $${(current / 1_000_000).toFixed(1)}M + proposed $${(proposed / 1_000_000).toFixed(1)}M exceeds the ${limitPct}% lending limit. Request a participation or reduce the ask.`,
      citation: "12 CFR 32",
      data: { current, proposed, newTotal, pct, limitPct },
    };
  }
  if (pct >= SINGLE_BORROWER_WATCH_PCT) {
    return {
      status: "warn",
      headline: `Combined exposure ${pct.toFixed(2)}% — above the ${SINGLE_BORROWER_WATCH_PCT}% prudential watch line`,
      detail:
        "Below the regulatory ceiling but the credit committee will need to confirm that internal concentration appetite is intact.",
      citation: "12 CFR 32",
      data: { current, proposed, newTotal, pct, limitPct },
    };
  }
  return {
    status: "pass",
    headline: `Combined exposure ${pct.toFixed(2)}% of Tier 1 — well within limits`,
    detail: `Current $${(current / 1_000_000).toFixed(1)}M + proposed $${(proposed / 1_000_000).toFixed(1)}M leaves headroom under the ${limitPct}% ceiling.`,
    citation: "12 CFR 32",
    data: { current, proposed, newTotal, pct, limitPct },
  };
}

async function checkConcentration(
  borrower: BorrowerExposure | BorrowerSearchHit,
  proposed: number,
): Promise<CheckResult> {
  const pool = getPool();
  const sector = naicsSector(borrower.naics_code ?? null);
  const region = stateRegion(borrower.primary_state ?? null);

  const r = await pool.query(
    `SELECT bm.borrower_id, bm.naics_code, bm.primary_state,
            COALESCE(SUM(lf.committed_usd) FILTER (WHERE lf.status='active'), 0) AS committed_usd
     FROM borrower_master bm
     LEFT JOIN loan_facilities lf ON lf.borrower_id = bm.borrower_id
     GROUP BY bm.borrower_id, bm.naics_code, bm.primary_state`,
  );
  let cellTotal = 0;
  for (const row of r.rows) {
    const s = naicsSector(row.naics_code ? String(row.naics_code) : null);
    const reg = stateRegion(row.primary_state ? String(row.primary_state) : null);
    if (s === sector && reg === region) cellTotal += num(row.committed_usd);
  }
  const newCellTotal = cellTotal + proposed;
  const pct = (newCellTotal / TIER1_CAPITAL_USD) * 100;
  const data = { cellTotal, proposed, newCellTotal, pct, sector, region };
  if (pct >= SECTOR_CELL_BREACH_PCT) {
    return {
      status: "breach",
      headline: `${sector} × ${region} concentration would hit ${pct.toFixed(2)}%`,
      detail:
        "Bank policy caps any sector × region cell at 10% of Tier 1. CCO concurrence required before this can move forward.",
      data,
    };
  }
  if (pct >= SECTOR_CELL_WATCH_PCT) {
    return {
      status: "warn",
      headline: `${sector} × ${region} concentration → ${pct.toFixed(2)}%`,
      detail:
        "Above the 7% internal watch line but under the 10% breach line. Surface in the credit memo so the committee can weigh appetite.",
      data,
    };
  }
  return {
    status: "pass",
    headline: `${sector} × ${region} concentration → ${pct.toFixed(2)}%`,
    detail: "Comfortably within bank concentration appetite.",
    data,
  };
}

const worstOf = (...statuses: CheckStatus[]): CheckStatus => {
  if (statuses.includes("breach")) return "breach";
  if (statuses.includes("warn")) return "warn";
  return "pass";
};

export async function prescreenBorrower(
  input: PrescreenInput,
): Promise<PrescreenResult> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT borrower_id, legal_name, dba_name, ein, naics_code, primary_state,
            risk_rating, relationship_since
     FROM borrower_master
     WHERE borrower_id = $1`,
    [input.borrower_id],
  );
  if (r.rows.length === 0) {
    throw new Error(`Unknown borrower ${input.borrower_id}`);
  }
  const row = r.rows[0]!;
  const current = await getCommittedForBorrower(input.borrower_id);
  const borrower: BorrowerSearchHit = {
    borrower_id: String(row.borrower_id),
    legal_name: String(row.legal_name),
    dba_name: row.dba_name ? String(row.dba_name) : null,
    ein: row.ein ? String(row.ein) : null,
    naics_code: row.naics_code ? String(row.naics_code) : null,
    primary_state: row.primary_state ? String(row.primary_state) : null,
    risk_rating: row.risk_rating ? String(row.risk_rating) : null,
    relationship_since: row.relationship_since
      ? new Date(row.relationship_since).toISOString().slice(0, 10)
      : null,
    committed_usd: current,
  };

  const [insider, concentration] = await Promise.all([
    checkInsider(input.borrower_id),
    checkConcentration(borrower, input.proposed_amount),
  ]);
  const single_borrower = checkSingleBorrower(current, input.proposed_amount);
  const overall = worstOf(insider.status, single_borrower.status, concentration.status);

  return {
    borrower,
    proposed_amount: input.proposed_amount,
    facility_type: input.facility_type,
    term_years: input.term_years,
    insider,
    single_borrower,
    concentration,
    overall,
  };
}
