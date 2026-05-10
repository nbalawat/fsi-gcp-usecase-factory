/**
 * Server-side auto-grounding for the credit memo.
 *
 * The drafter agent emits memos with empty `citations: []` arrays per
 * section even though the document_processor extracted 20+ chunks with
 * page numbers + verbatim excerpts. This module attaches the most
 * relevant extracted citations to each section based on a topic map,
 * so every section renders with at least 1–3 verifiable sources
 * without depending on the drafter to do its job.
 *
 * Deterministic, zero LLM cost, retroactively fixes existing memos.
 *
 * Two layers:
 *
 *   1. **Section-topic map** — each memo section_key maps to a set of
 *      extracted-field path prefixes that are relevant. e.g.
 *      `financial_analysis` matches `income_statement.*`,
 *      `balance_sheet.*`, `cash_flow.*`. Citations whose `field_path`
 *      starts with any of those prefixes get attached to that section.
 *
 *   2. **Per-section cap** — at most 5 citations per section, deduped
 *      by (doc_id, page) so we don't show the same page 4 times. Pick
 *      the chunks with the longest non-empty excerpts (more useful in
 *      the citation popover than 8-character snippets).
 */

import type { CreditMemoBody, Citation } from "../components/credit-memo/types";

interface DocumentExtractionRow {
  doc_id: string;
  doc_type: string;
  original_filename: string;
  citations: Array<{
    field_path?: string;
    page?: number;
    excerpt?: string | null;
    bbox?: unknown;
  }>;
}

/** Memo section_key → list of extracted field-path prefixes that
 *  ground that section's claims. */
const SECTION_TOPIC_MAP: Record<string, string[]> = {
  executive_summary: [
    "income_statement.revenue",
    "income_statement.net_income",
    "income_statement.ebitda",
    "balance_sheet.total_debt",
    "balance_sheet.total_assets",
    "fiscal_year_end",
  ],
  borrower_overview: [
    "officers",
    "subsidiaries",
    "segments",
    "business_description",
    "naics",
  ],
  financial_analysis: [
    "income_statement",
    "balance_sheet",
    "cash_flow",
  ],
  cash_flow_projection: [
    "cash_flow",
    "income_statement.ebitda",
    "income_statement.operating_income",
  ],
  risk_factors: [
    "going_concern_qualification",
    "customer_concentration",
    "subsequent_events",
    "segments",
  ],
  collateral: [
    "balance_sheet.ppe_net",
    "balance_sheet.real_estate",
    "balance_sheet.inventory",
    "appraised_value",
  ],
  covenant_package: [
    "balance_sheet.total_debt",
    "balance_sheet.long_term_debt",
    "income_statement.interest_expense",
    "income_statement.ebitda",
    "cash_flow.operating_cash_flow",
  ],
  regulatory_concentration: [
    "customer_concentration",
    "segments",
    "officers",
    "single_borrower",
  ],
  risk_rating_rationale: [
    "going_concern_qualification",
    "balance_sheet.total_debt",
    "balance_sheet.total_equity",
    "income_statement.ebitda",
    "income_statement.net_income",
  ],
  recommendation: [
    "income_statement.ebitda",
    "income_statement.net_income",
    "balance_sheet.total_debt",
    "balance_sheet.total_assets",
  ],
};

/** A claim text per topic prefix — used in the citation footer line so
 *  the banker reads "p.91 — total debt $128B" instead of just "p.91". */
const FIELD_CLAIM_LABEL: Record<string, string> = {
  "income_statement.revenue": "Revenue per income statement",
  "income_statement.net_income": "Net income per income statement",
  "income_statement.ebitda": "EBITDA per income statement",
  "income_statement.interest_expense": "Interest expense per income statement",
  "income_statement.operating_income": "Operating income per income statement",
  "income_statement.tax_expense": "Tax expense per income statement",
  "income_statement.cogs": "Cost of goods sold",
  "balance_sheet.total_assets": "Total assets per balance sheet",
  "balance_sheet.total_debt": "Total debt per balance sheet",
  "balance_sheet.total_equity": "Total equity per balance sheet",
  "balance_sheet.ppe_net": "Property, plant & equipment net",
  "balance_sheet.real_estate": "Real estate per balance sheet",
  "balance_sheet.inventory": "Inventory per balance sheet",
  "balance_sheet.long_term_debt": "Long-term debt per balance sheet",
  "balance_sheet.current_assets": "Current assets per balance sheet",
  "balance_sheet.current_liabilities": "Current liabilities per balance sheet",
  "cash_flow.operating_cash_flow": "Operating cash flow",
  "cash_flow.free_cash_flow": "Free cash flow",
  "cash_flow.capex": "Capital expenditures",
  "officers": "Senior officers / management team",
  "subsidiaries": "Subsidiaries disclosed in 10-K",
  "segments": "Operating segments per 10-K",
  "business_description": "Business description",
  "going_concern_qualification": "Going-concern qualification",
  "customer_concentration": "Customer concentration disclosure",
  "subsequent_events": "Subsequent-events disclosure",
  "fiscal_year_end": "Fiscal year-end",
};

/** A single extracted chunk normalized for citation use. */
interface NormalizedChunk {
  doc_id: string;
  doc_type: string;
  doc_filename: string;
  field_path: string;
  page: number;
  excerpt: string;
}

function normalizeChunks(documents: DocumentExtractionRow[]): NormalizedChunk[] {
  const out: NormalizedChunk[] = [];
  for (const d of documents) {
    for (const c of d.citations ?? []) {
      const fp = typeof c.field_path === "string" ? c.field_path : "";
      const pg = typeof c.page === "number" && c.page > 0 ? c.page : null;
      const ex = typeof c.excerpt === "string" ? c.excerpt.trim() : "";
      if (!fp || pg === null || ex.length < 10) continue;
      out.push({
        doc_id: d.doc_id,
        doc_type: d.doc_type,
        doc_filename: d.original_filename,
        field_path: fp,
        page: pg,
        excerpt: ex,
      });
    }
  }
  return out;
}

/** Match a chunk's field_path against a list of topic prefixes. */
function matchesTopic(field_path: string, prefixes: string[]): string | null {
  for (const p of prefixes) {
    if (field_path === p || field_path.startsWith(p + ".") || field_path.startsWith(p)) {
      return p;
    }
  }
  return null;
}

function pickCitationsForSection(
  sectionKey: string,
  chunks: NormalizedChunk[],
  cap = 5,
): Citation[] {
  const prefixes = SECTION_TOPIC_MAP[sectionKey];
  if (!prefixes) return [];

  const matched = chunks
    .map((c) => ({ c, matched: matchesTopic(c.field_path, prefixes) }))
    .filter((x): x is { c: NormalizedChunk; matched: string } => x.matched !== null);

  // Dedupe by (doc_id, page) — keep the chunk with the longest excerpt
  const byDocPage = new Map<string, { c: NormalizedChunk; matched: string }>();
  for (const x of matched) {
    const key = `${x.c.doc_id}::${x.c.page}`;
    const existing = byDocPage.get(key);
    if (!existing || x.c.excerpt.length > existing.c.excerpt.length) {
      byDocPage.set(key, x);
    }
  }

  // Sort: longest excerpt first (most informative)
  const ordered = Array.from(byDocPage.values()).sort(
    (a, b) => b.c.excerpt.length - a.c.excerpt.length,
  );

  return ordered.slice(0, cap).map(({ c, matched }) => {
    // Map doc_type onto the Citation.kind union so the citation popover
    // renders the right icon/format. Fall back to "other".
    const kind: Citation["kind"] =
      c.doc_type === "10-K"
        ? "10-K_page"
        : c.doc_type === "10-Q"
          ? "10-Q_page"
          : c.doc_type === "audited_financials"
            ? "audited_financials"
            : c.doc_type === "appraisal"
              ? "appraisal"
              : "other";
    return {
      source: c.doc_filename,
      page: c.page,
      section: c.doc_type,
      excerpt: c.excerpt.length > 280 ? c.excerpt.slice(0, 280) + "…" : c.excerpt,
      claim: FIELD_CLAIM_LABEL[matched] ?? `Field: ${matched}`,
      kind,
      url: null,
    } satisfies Citation;
  });
}

/**
 * Walk a memo body and attach auto-grounded citations to any section
 * that the drafter left empty. Sections that already have citations
 * from the drafter are left untouched (we never overwrite agent-emitted
 * citations).
 *
 * Returns a NEW memo body — the input is not mutated.
 */
export function autoGroundMemo(
  memo: Partial<CreditMemoBody>,
  documents: DocumentExtractionRow[],
): Partial<CreditMemoBody> {
  if (!memo || typeof memo !== "object") return memo;
  const chunks = normalizeChunks(documents);
  if (chunks.length === 0) return memo;

  const next: Record<string, unknown> = { ...(memo as Record<string, unknown>) };
  for (const sectionKey of Object.keys(SECTION_TOPIC_MAP)) {
    const section = next[sectionKey] as Record<string, unknown> | undefined;
    if (!section || typeof section !== "object") continue;

    const existing = section.citations as unknown[] | undefined;
    if (Array.isArray(existing) && existing.length > 0) continue;
    const auto = pickCitationsForSection(sectionKey, chunks);
    if (auto.length === 0) continue;

    next[sectionKey] = { ...section, citations: auto };
  }
  return next as Partial<CreditMemoBody>;
}
