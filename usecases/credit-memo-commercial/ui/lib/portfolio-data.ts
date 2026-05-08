/**
 * CCO portfolio aggregations — server-only. Reads `borrower_master` and
 * `loan_facilities` to compute committed exposure, sector × geography
 * concentration cells, and single-borrower top exposures.
 *
 * All math is dollar-accurate (numerics → JS number once, no float surprises
 * because the demo bank is < $10B and exposures fit comfortably in double).
 */

import { getPool } from "@/lib/db";
import {
  TIER1_CAPITAL_USD,
  naicsSector,
  stateRegion,
  CECL_ALLOWANCE_RATIO,
  CECL_PROJECTED_RATIO_FY26,
} from "@/lib/bank-config";

export interface BorrowerExposure {
  borrower_id: string;
  legal_name: string;
  dba_name: string | null;
  naics_code: string | null;
  primary_state: string | null;
  risk_rating: string | null;
  committed_usd: number;
  outstanding_usd: number;
  facility_count: number;
  sector: string;
  region: string;
}

export interface PortfolioSnapshot {
  totalCommitted: number;
  totalOutstanding: number;
  facilityCount: number;
  borrowerCount: number;
  watchlistCount: number;
  watchlistCommitted: number;
  ceclAllowance: number;
  ceclProjected: number;
  tier1Capital: number;
  tier1HeadroomUsd: number;
  tier1HeadroomPct: number;
  borrowers: BorrowerExposure[];
}

export interface HeatmapCell {
  sector: string;
  region: string;
  committed: number;
  pctTier1: number;
  borrowers: BorrowerExposure[];
}

export interface ConcentrationView {
  sectors: string[];
  regions: string[];
  cells: HeatmapCell[];
  topBorrowers: BorrowerExposure[];
  tier1Capital: number;
  totalCommitted: number;
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

/** One row per borrower with committed + outstanding rolled up across facilities. */
export async function getBorrowerExposures(): Promise<BorrowerExposure[]> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT
        bm.borrower_id,
        bm.legal_name,
        bm.dba_name,
        bm.naics_code,
        bm.primary_state,
        bm.risk_rating,
        COALESCE(SUM(lf.committed_usd) FILTER (WHERE lf.status = 'active'), 0)   AS committed_usd,
        COALESCE(SUM(lf.outstanding_usd) FILTER (WHERE lf.status = 'active'), 0) AS outstanding_usd,
        COUNT(lf.facility_id) FILTER (WHERE lf.status = 'active')                AS facility_count
     FROM borrower_master bm
     LEFT JOIN loan_facilities lf ON lf.borrower_id = bm.borrower_id
     GROUP BY bm.borrower_id, bm.legal_name, bm.dba_name, bm.naics_code,
              bm.primary_state, bm.risk_rating
     ORDER BY committed_usd DESC`,
  );
  return r.rows.map((row) => {
    const committed = num(row.committed_usd);
    const outstanding = num(row.outstanding_usd);
    const naics = row.naics_code ? String(row.naics_code) : null;
    const state = row.primary_state ? String(row.primary_state) : null;
    return {
      borrower_id: String(row.borrower_id),
      legal_name: String(row.legal_name),
      dba_name: row.dba_name ? String(row.dba_name) : null,
      naics_code: naics,
      primary_state: state,
      risk_rating: row.risk_rating ? String(row.risk_rating) : null,
      committed_usd: committed,
      outstanding_usd: outstanding,
      facility_count: Number(row.facility_count ?? 0),
      sector: naicsSector(naics),
      region: stateRegion(state),
    };
  });
}

/** Borrowers we consider "watchlist" — risk band 2+ or substandard ratings. */
function isWatchlist(b: BorrowerExposure): boolean {
  if (!b.risk_rating) return false;
  if (b.risk_rating.startsWith("1")) return false;
  return true;
}

export async function getPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  const borrowers = await getBorrowerExposures();
  const totalCommitted = borrowers.reduce((s, b) => s + b.committed_usd, 0);
  const totalOutstanding = borrowers.reduce((s, b) => s + b.outstanding_usd, 0);
  const facilityCount = borrowers.reduce((s, b) => s + b.facility_count, 0);
  const watch = borrowers.filter(isWatchlist);
  const watchlistCommitted = watch.reduce((s, b) => s + b.committed_usd, 0);
  const tier1HeadroomUsd = Math.max(0, TIER1_CAPITAL_USD - totalCommitted);
  const tier1HeadroomPct =
    TIER1_CAPITAL_USD > 0
      ? (tier1HeadroomUsd / TIER1_CAPITAL_USD) * 100
      : 0;
  return {
    totalCommitted,
    totalOutstanding,
    facilityCount,
    borrowerCount: borrowers.length,
    watchlistCount: watch.length,
    watchlistCommitted,
    ceclAllowance: totalCommitted * CECL_ALLOWANCE_RATIO,
    ceclProjected: totalCommitted * CECL_PROJECTED_RATIO_FY26,
    tier1Capital: TIER1_CAPITAL_USD,
    tier1HeadroomUsd,
    tier1HeadroomPct,
    borrowers,
  };
}

/**
 * Build the sector × region heatmap. We render the top-N sectors (with
 * non-zero exposure) on the columns and the top-M regions on the rows.
 *
 * `proposedAddition` is used by the "what if?" panel — it's added to the
 * relevant cell + the borrower list when present.
 */
export function buildConcentrationView(
  borrowers: BorrowerExposure[],
  proposedAddition?: { borrower: BorrowerExposure; amount: number } | null,
  maxSectors = 6,
  maxRegions = 6,
): ConcentrationView {
  const augmented = borrowers.map((b) => ({ ...b }));
  if (proposedAddition) {
    const idx = augmented.findIndex(
      (b) => b.borrower_id === proposedAddition.borrower.borrower_id,
    );
    if (idx >= 0) {
      const existing = augmented[idx]!;
      augmented[idx] = {
        ...existing,
        committed_usd: existing.committed_usd + proposedAddition.amount,
      };
    } else {
      augmented.push({
        ...proposedAddition.borrower,
        committed_usd: proposedAddition.amount,
        outstanding_usd: 0,
        facility_count: 1,
      });
    }
  }

  const sectorTotals = new Map<string, number>();
  const regionTotals = new Map<string, number>();
  for (const b of augmented) {
    sectorTotals.set(b.sector, (sectorTotals.get(b.sector) ?? 0) + b.committed_usd);
    regionTotals.set(b.region, (regionTotals.get(b.region) ?? 0) + b.committed_usd);
  }
  const sectors = [...sectorTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSectors)
    .map((e) => e[0]);
  const regions = [...regionTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxRegions)
    .map((e) => e[0]);

  const cells: HeatmapCell[] = [];
  for (const sector of sectors) {
    for (const region of regions) {
      const inCell = augmented.filter(
        (b) => b.sector === sector && b.region === region && b.committed_usd > 0,
      );
      const committed = inCell.reduce((s, b) => s + b.committed_usd, 0);
      cells.push({
        sector,
        region,
        committed,
        pctTier1: TIER1_CAPITAL_USD > 0 ? (committed / TIER1_CAPITAL_USD) * 100 : 0,
        borrowers: inCell.sort((a, b) => b.committed_usd - a.committed_usd),
      });
    }
  }

  const topBorrowers = [...augmented]
    .sort((a, b) => b.committed_usd - a.committed_usd)
    .slice(0, 5);

  const totalCommitted = augmented.reduce((s, b) => s + b.committed_usd, 0);

  return {
    sectors,
    regions,
    cells,
    topBorrowers,
    tier1Capital: TIER1_CAPITAL_USD,
    totalCommitted,
  };
}

/** Find a borrower by id, used by the what-if simulation route. */
export function findBorrower(
  borrowers: BorrowerExposure[],
  borrowerId: string,
): BorrowerExposure | null {
  return borrowers.find((b) => b.borrower_id === borrowerId) ?? null;
}
