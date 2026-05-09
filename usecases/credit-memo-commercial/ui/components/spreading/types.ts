/**
 * Spreading-panel types — the analyst output's `normalization`
 * sub-section + service_results.financial_spreader output.
 */

export interface LineItemRow {
  /** Dotted path, e.g. "income_statement.revenue" */
  path: string;
  label: string;
  /** Per-source-doc raw values keyed by doc_id. */
  raw_per_doc: Record<string, number | null>;
  /** Post-spreader normalized value. */
  normalized: number | null;
  /** Adjustment delta (normalized - sum_of_raw, signed). */
  adjustment: number | null;
  /** Banker-readable rationale; pulled from analyst.normalization.adjustments. */
  adjustment_rationale: string | null;
}

export interface RatioRow {
  name: string;
  value: number | null;
  /** Threshold context — value is fine when between floor and ceiling. */
  floor: number | null;
  ceiling: number | null;
  /** Banker-readable interpretation, 1-2 sentences. */
  tooltip: string;
  band: "good" | "warning" | "concern";
}

export interface SpreadingViewModel {
  fiscal_year_end: string;
  source_doc_summaries: Array<{ doc_id: string; doc_type: string; original_filename: string }>;
  line_items: LineItemRow[];
  ratios: RatioRow[];
}
