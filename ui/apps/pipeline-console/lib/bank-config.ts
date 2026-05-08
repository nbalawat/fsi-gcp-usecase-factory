/**
 * Bank-wide constants for the live demo. One source of truth so every persona
 * view (CCO portfolio, RM pre-screen, underwriter detail) speaks the same
 * numbers.
 *
 * In production these come from `thresholds` / `capital_planning` tables; the
 * demo hard-codes them so screens are stable across DB resets.
 */

/** Tier 1 capital used for concentration math across the platform. */
export const TIER1_CAPITAL_USD = 326_000_000;

/**
 * 12 CFR 32 — Lending limits. A national bank's loans to one borrower may not
 * exceed 15% of unimpaired capital + surplus, plus an extra 10% if fully
 * secured by readily marketable collateral. Atrium uses the unsecured 15% as
 * the headline ceiling and surfaces the 10% prudential watch line.
 */
export const SINGLE_BORROWER_HARD_LIMIT_PCT = 15;
export const SINGLE_BORROWER_WATCH_PCT = 10;

/**
 * Sector concentration appetite — bank's internal policy (not regulatory):
 *   - 7% per (sector × geography) cell triggers an internal watch.
 *   - 10% per cell triggers a board-level concentration breach.
 */
export const SECTOR_CELL_WATCH_PCT = 7;
export const SECTOR_CELL_BREACH_PCT = 10;

/** CECL allowance ratio used when no posted allowance is on hand. */
export const CECL_ALLOWANCE_RATIO = 0.0085;
export const CECL_PROJECTED_RATIO_FY26 = 0.0105;

/** Friendly NAICS 2-digit → sector label map; used in the heatmap header row. */
export const NAICS_SECTOR_LABELS: Record<string, string> = {
  "11": "Agriculture",
  "21": "Mining & Energy",
  "22": "Utilities",
  "23": "Construction",
  "31": "Manufacturing",
  "32": "Manufacturing",
  "33": "Manufacturing",
  "42": "Wholesale",
  "44": "Retail Trade",
  "45": "Retail Trade",
  "48": "Transportation",
  "49": "Transportation",
  "51": "Information",
  "52": "Finance & Insurance",
  "53": "Real Estate",
  "54": "Professional Services",
  "55": "Management",
  "56": "Admin Support",
  "61": "Education",
  "62": "Health Care",
  "71": "Arts & Recreation",
  "72": "Accommodation & Food",
  "81": "Other Services",
  "92": "Public Administration",
};

/** Map an NAICS 2-digit prefix to the sector label, with a sensible fallback. */
export function naicsSector(naics: string | null | undefined): string {
  if (!naics) return "Unclassified";
  const prefix = naics.slice(0, 2);
  return NAICS_SECTOR_LABELS[prefix] ?? "Other";
}

/** Bucket a state code (2-letter) into a small region group for the heatmap. */
export const US_STATE_REGION: Record<string, string> = {
  // Northeast
  CT: "Northeast", MA: "Northeast", ME: "Northeast", NH: "Northeast", NJ: "Northeast",
  NY: "Northeast", PA: "Northeast", RI: "Northeast", VT: "Northeast",
  // Mid-Atlantic / Southeast
  DC: "Southeast", DE: "Southeast", FL: "Southeast", GA: "Southeast", MD: "Southeast",
  NC: "Southeast", SC: "Southeast", VA: "Southeast", WV: "Southeast",
  AL: "Southeast", MS: "Southeast", TN: "Southeast", KY: "Southeast", AR: "Southeast",
  LA: "Southeast",
  // Midwest
  IL: "Midwest", IN: "Midwest", IA: "Midwest", KS: "Midwest", MI: "Midwest",
  MN: "Midwest", MO: "Midwest", ND: "Midwest", NE: "Midwest", OH: "Midwest",
  SD: "Midwest", WI: "Midwest",
  // Southwest
  AZ: "Southwest", NM: "Southwest", OK: "Southwest", TX: "Southwest",
  // West
  AK: "West", CA: "West", CO: "West", HI: "West", ID: "West", MT: "West",
  NV: "West", OR: "West", UT: "West", WA: "West", WY: "West",
};

export function stateRegion(stateCode: string | null | undefined): string {
  if (!stateCode) return "Unspecified";
  return US_STATE_REGION[stateCode.toUpperCase()] ?? "Other";
}
