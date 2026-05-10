/**
 * Spreading workbench data model.
 *
 * The shape is rich on purpose — every value the underwriter sees on the
 * panel must trace back to a citation in a source document. Hallucinated
 * numbers don't survive review; this model forces the agents (or the
 * atomic services) to pin every cell to a {doc_id, page} reference, and
 * the UI rejects values that arrive without one.
 */

export type FiscalKey = string; // e.g. "FY2022" | "FY2023" | "FY2024" | "Q3-2024"

export type LineItemCategory =
  | "income_statement"
  | "balance_sheet"
  | "cash_flow"
  | "ratios";

export interface Citation {
  /** Document the value came from (matches application_documents.doc_id). */
  doc_id: string;
  /** 1-indexed page number for the UI's bbox overlay. */
  page: number;
  /** Optional excerpt the popover shows verbatim from the chunk. */
  excerpt?: string | null;
  /** Optional bbox in normalized [0,1] coordinates. */
  bbox?: [number, number, number, number] | null;
}

/** A single value at a (line_item, fiscal_year) intersection. */
export interface ValueCell {
  /** Numeric value in absolute USD (or unit-less for ratios). */
  value: number | null;
  /** Source citation. Required for raw values; optional for normalized
   *  values that are derived (sum of components etc). */
  citation?: Citation | null;
  /** Banker note attached to this cell (e.g. why an adjustment was made). */
  note?: string | null;
  /** True when this value was set or edited by a human, not extracted. */
  human_edited?: boolean;
}

export interface AdjustmentEntry {
  amount: number;
  rationale: string;
  category: "one_time_charge" | "non_recurring_gain" | "accounting_change" | "restructuring" | "other";
  applied_at: string; // ISO timestamp
}

export interface LineItemRow {
  /** Dotted path key (e.g. "income_statement.revenue"). */
  path: string;
  /** Banker-readable label. */
  label: string;
  category: LineItemCategory;
  /** True for keys the analyst flagged as critical (revenue, total_assets, etc). */
  is_critical?: boolean;

  /** Raw values per fiscal year — extracted from documents. */
  raw: Partial<Record<FiscalKey, ValueCell>>;

  /** Normalized values per fiscal year — post-spreader, post-adjustment.
   *  This is the value downstream agents (rater, drafter) consume. */
  normalized: Partial<Record<FiscalKey, ValueCell>>;

  /** Per-fiscal-year adjustments. Empty array = no human override. */
  adjustments: Partial<Record<FiscalKey, AdjustmentEntry[]>>;
}

export type RatioBand = "good" | "warning" | "concern" | "neutral";

export interface RatioRow {
  /** Stable identifier so React lists are well-keyed. */
  key: string;
  name: string;
  /** "Debt service coverage" etc — short helper sentence shown in tooltip. */
  description: string;
  /** Per-year computed value. */
  values: Partial<Record<FiscalKey, number | null>>;
  /** Band for the most recent year — drives the strip color. */
  band: RatioBand;
  /** Optional thresholds — show below the ratio number. */
  floor?: number | null;
  ceiling?: number | null;
  /** Peer comparison (median of NAICS-matched cohort). */
  peer_median?: number | null;
  /** Banker's interpretation, 1-2 sentences. */
  interpretation?: string;
}

export type ScenarioKey =
  | "base"
  | "rev_shock_15"
  | "rev_shock_25"
  | "rate_shock_300"
  | "margin_compression";

export interface StressScenario {
  key: ScenarioKey;
  label: string;
  description: string;
  /** Ratios computed under this scenario (only the stress-sensitive ones). */
  ratios: RatioRow[];
  passes: boolean;
}

export interface SourceDocSummary {
  doc_id: string;
  doc_type: string;
  original_filename: string;
  page_count: number | null;
  /** Fiscal coverage — what years this doc reports. */
  fiscal_coverage: FiscalKey[];
}

/** Top-level model the workbench renders. */
export interface SpreadingViewModel {
  application_id: string;
  borrower_name: string;

  /** All fiscal years covered across the document set, sorted oldest → newest. */
  fiscal_years: FiscalKey[];
  /** The "current" year — the one the rater + drafter use. */
  primary_fiscal_year: FiscalKey;

  source_docs: SourceDocSummary[];
  line_items: LineItemRow[];
  ratios: RatioRow[];
  scenarios: StressScenario[];

  /** True when at least one cell has been human-edited; UI shows a
   *  "Save adjustments" button. */
  has_pending_edits?: boolean;

  /** ISO timestamp of last spreader run. */
  last_spread_at?: string;
  /** Vendor + revision used (Track A — Landing AI ADE) for traceability. */
  spread_source?: string;
}
