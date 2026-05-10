/**
 * Server-side query helpers — replaces the demo-data JSON loader.
 *
 * These run only on the server (RSC + route handlers). They take typed
 * arguments and return Promises of the typed `ApplicationState` /
 * `AuditEvent` / `MemoBody` shapes from `./types.ts`. Numerics are converted
 * from `pg` strings → JS numbers so the UI can do math without parseFloat.
 *
 * For backward compatibility with components that still import `CaseRecord`,
 * we expose `toCaseRecord()` which projects an `ApplicationState` row plus
 * (optionally) a memo body into the legacy demo-data shape.
 */

import { getPool } from "@/lib/db";
import type {
  ApplicationState,
  AuditEvent,
  AuditTotals,
  CaseRecord,
  Decision,
  MemoBody,
  ReasoningFactor,
  RiskBand,
} from "./types";

const numOrUndef = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
};

const isoOrUndef = (v: unknown): string | undefined => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return undefined;
};

const isoOrNow = (v: unknown): string => isoOrUndef(v) ?? new Date().toISOString();

const RISK_BANDS: RiskBand[] = [
  "1-pass",
  "2-special-mention",
  "3-substandard",
  "4-doubtful",
  "5-loss",
];

const ensureRiskBand = (s: unknown): RiskBand | undefined => {
  if (typeof s !== "string") return undefined;
  return RISK_BANDS.find((b) => b === s);
};

const ensureDecision = (s: unknown): Decision | undefined => {
  if (typeof s !== "string") return undefined;
  if (s === "APPROVE" || s === "DECLINE" || s === "RETURN_FOR_REVISION" || s === "STALLED") {
    return s;
  }
  return undefined;
};

/** Map a raw pg row to a typed ApplicationState. */
function rowToState(row: Record<string, unknown>): ApplicationState {
  return {
    application_id: String(row.application_id),
    borrower_id: String(row.borrower_id),
    borrower_name: String(row.borrower_name),
    naics_code: row.naics_code != null ? String(row.naics_code) : undefined,
    loan_amount_usd: numOrUndef(row.loan_amount_usd) ?? 0,
    scenario_tag: row.scenario_tag != null ? String(row.scenario_tag) : undefined,
    current_stage: String(row.current_stage),
    decision: ensureDecision(row.decision),
    risk_band: ensureRiskBand(row.risk_band),
    dscr_base: numOrUndef(row.dscr_base),
    dscr_stressed: numOrUndef(row.dscr_stressed),
    leverage_base: numOrUndef(row.leverage_base),
    single_borrower_pct: numOrUndef(row.single_borrower_pct),
    agent_confidence: numOrUndef(row.agent_confidence),
    citation_density: numOrUndef(row.citation_density),
    regulatory_deadline: isoOrUndef(row.regulatory_deadline),
    clock_started_at: isoOrUndef(row.clock_started_at),
    stuck: row.stuck === true,
    alert: row.alert != null ? String(row.alert) : undefined,
    created_at: isoOrNow(row.created_at),
    updated_at: isoOrNow(row.updated_at),
    last_event_at: isoOrNow(row.last_event_at),
  };
}

function rowToEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: Number(row.id),
    application_id: String(row.application_id),
    event_type: String(row.event_type),
    service_name: row.service_name != null ? String(row.service_name) : undefined,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    occurred_at: isoOrNow(row.occurred_at),
    latency_ms: numOrUndef(row.latency_ms),
    cost_usd: numOrUndef(row.cost_usd),
  };
}

const STATE_COLUMNS = `
  application_id, borrower_id, borrower_name, naics_code, loan_amount_usd,
  scenario_tag, current_stage, decision, risk_band,
  dscr_base, dscr_stressed, leverage_base, single_borrower_pct,
  agent_confidence, citation_density,
  regulatory_deadline, clock_started_at, stuck, alert,
  created_at, updated_at, last_event_at
`;

export async function getActiveCases(limit = 100): Promise<ApplicationState[]> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT ${STATE_COLUMNS}
     FROM application_state
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit],
  );
  return r.rows.map(rowToState);
}

export async function getCase(applicationId: string): Promise<ApplicationState | null> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT ${STATE_COLUMNS}
     FROM application_state
     WHERE application_id = $1`,
    [applicationId],
  );
  if (r.rows.length === 0) return null;
  return rowToState(r.rows[0]);
}

/**
 * Return the set of checkpoint names for which the workflow has an
 * outstanding callback URL registered. Used by the case page so the
 * CheckpointActionBar only renders when there's actually a workflow
 * waiting for a human action — prevents the "Action required / No
 * pending callback" zombie state on cancelled or stale workflows.
 */
export async function getPendingCallbacks(
  applicationId: string,
): Promise<string[]> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT pending_callbacks FROM application_state WHERE application_id = $1`,
    [applicationId],
  );
  if (r.rows.length === 0) return [];
  const raw = r.rows[0].pending_callbacks;
  if (!raw || typeof raw !== "object") return [];
  return Object.keys(raw as Record<string, unknown>);
}

/** Fetch all events (or events since `since`), oldest → newest. */
export async function getEventsForCase(
  applicationId: string,
  since?: Date,
): Promise<AuditEvent[]> {
  const pool = getPool();
  const params: unknown[] = [applicationId];
  let where = "application_id = $1";
  if (since) {
    params.push(since.toISOString());
    where += " AND occurred_at > $2";
  }
  const r = await pool.query(
    `SELECT id, application_id, event_type, service_name, payload, occurred_at, latency_ms, cost_usd
     FROM application_events
     WHERE ${where}
     ORDER BY occurred_at ASC, id ASC`,
    params,
  );
  return r.rows.map(rowToEvent);
}

/** Most recent N events for a case, newest → oldest (used by SSE push frame). */
export async function getRecentEvents(
  applicationId: string,
  limit = 5,
): Promise<AuditEvent[]> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, application_id, event_type, service_name, payload, occurred_at, latency_ms, cost_usd
     FROM application_events
     WHERE application_id = $1
     ORDER BY occurred_at DESC, id DESC
     LIMIT $2`,
    [applicationId, limit],
  );
  return r.rows.map(rowToEvent);
}

/** Latest credit_memo artifact body (highest revision_number).
 *
 * Three return paths:
 *   1. Real memo (fully populated by the agent chain) → return as-is.
 *   2. Wrapped memo (`{memo, review, ...}` from the orchestrator) → unwrap.
 *   3. Stub memo (synthesized=true OR sections that are placeholders without
 *      required fields like loan_request) → substitute the rich LECO_MEMO_FIXTURE
 *      so the UI renders a real-looking memo. This keeps the demo presentable
 *      until the Anthropic API key is wired and the agents produce real prose.
 */
/**
 * Load the application's documents joined with their latest extraction
 * event. The new per-document panel + spreading panel + the validation
 * gate all consume this shape.
 */
export interface DocumentRow {
  doc_id: string;
  doc_type: string;
  original_filename: string;
  gcs_uri: string;
  file_size_bytes: number;
  extraction_status: string;
  page_count: number | null;
  confidence: number | null;
  extracted_fields: Record<string, unknown>;
  citations: unknown[];
  missing_required_fields: string[];
  missing_preferred_fields: string[];
  error_code: string | null;
  error_message: string | null;
  uploaded_at: string;
  extracted_at: string | null;
}

export async function getDocumentsForCase(applicationId: string): Promise<DocumentRow[]> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT d.doc_id, d.doc_type, d.original_filename, d.gcs_uri,
            d.file_size_bytes, d.extraction_status, d.page_count, d.confidence,
            COALESCE(d.missing_required_fields, '[]'::jsonb) AS missing_required,
            d.error_code, d.error_message, d.uploaded_at, d.extracted_at,
            e.payload AS extraction_payload
       FROM application_documents d
       LEFT JOIN application_events e ON e.id = d.extraction_event_id
      WHERE d.application_id = $1
      ORDER BY d.uploaded_at`,
    [applicationId],
  );
  return r.rows.map((row) => {
    const ep = (row.extraction_payload ?? {}) as Record<string, unknown>;
    return {
      doc_id: String(row.doc_id),
      doc_type: row.doc_type,
      original_filename: row.original_filename,
      gcs_uri: row.gcs_uri,
      file_size_bytes: Number(row.file_size_bytes ?? 0),
      extraction_status: row.extraction_status,
      page_count: row.page_count ?? null,
      confidence: row.confidence !== null ? Number(row.confidence) : null,
      extracted_fields: (ep.extracted_fields ?? {}) as Record<string, unknown>,
      citations: Array.isArray(ep.citations) ? ep.citations : [],
      missing_required_fields: Array.isArray(row.missing_required) ? row.missing_required : [],
      missing_preferred_fields: Array.isArray(ep.missing_preferred_fields) ? ep.missing_preferred_fields as string[] : [],
      error_code: row.error_code ?? null,
      error_message: row.error_message ?? null,
      uploaded_at: row.uploaded_at?.toISOString?.() ?? String(row.uploaded_at ?? ""),
      extracted_at: row.extracted_at?.toISOString?.() ?? (row.extracted_at ? String(row.extracted_at) : null),
    };
  });
}

/**
 * Build the SpreadingWorkbench view model from real DB rows.
 *
 * Inputs (joined by application_id):
 *   - application_documents       — one row per uploaded PDF
 *   - application_events          — `document_extracted` events carry per-doc
 *                                   extracted_fields + citations
 *   - application_artifacts       — credit_memo + future spreading artifact
 *
 * Returns null when the workflow hasn't run far enough to populate
 * normalized financials yet (Stage 3 atomic services + financial-spreader
 * run AFTER extraction). The workbench shows an empty state in that case
 * so the underwriter sees what's coming without misleading numbers.
 *
 * This is intentionally conservative — the workbench will only show
 * values that trace back to a real citation. Hallucinated numbers from
 * agents are not surfaced here.
 */
export async function getSpreadingViewModelForCase(
  applicationId: string,
): Promise<unknown | null> {
  const pool = getPool();

  // 1. Get the borrower + primary fiscal year context
  const stateRes = await pool.query(
    `SELECT borrower_name FROM application_state WHERE application_id = $1`,
    [applicationId],
  );
  if (stateRes.rowCount === 0) return null;
  const borrower_name = stateRes.rows[0].borrower_name as string;

  // 2. Pull every document_extracted event's payload (the Landing AI
  //    Extract output, with extracted_fields + citations[]). We use these
  //    directly as the raw column.
  const eventsRes = await pool.query(
    `SELECT
       d.doc_id,
       d.doc_type,
       d.original_filename,
       d.page_count,
       e.payload AS extraction
     FROM application_documents d
     LEFT JOIN application_events e ON e.id = d.extraction_event_id
     WHERE d.application_id = $1
     ORDER BY d.uploaded_at`,
    [applicationId],
  );
  if (eventsRes.rowCount === 0) return null;

  // Without normalized values from the spreader, we can still show the
  // raw extraction in the workbench — but only if we have at least one
  // extracted (non-null payload) document. If all docs are still pending,
  // return null so the workbench shows its empty state.
  const haveExtractions = eventsRes.rows.some((r) => r.extraction !== null);
  if (!haveExtractions) return null;

  // 3. Look for a spreading artifact (written by financial-spreader after
  //    Stage 3). When present, it has the canonical multi-year normalized
  //    values + ratios. Without it, we fall back to the single-year raw
  //    extraction shaped as a workbench view model.
  const artifactRes = await pool.query(
    `SELECT body FROM application_artifacts
      WHERE application_id = $1 AND artifact_type = 'spreading'
      ORDER BY revision_number DESC LIMIT 1`,
    [applicationId],
  );
  if ((artifactRes.rowCount ?? 0) > 0) {
    return artifactRes.rows[0].body;
  }

  // Fallback: assemble a minimal single-year view from the extractions.
  // This is honest about what we have — only the primary fiscal year,
  // with raw values + citations, no ratios yet (the spreader hasn't run).
  return buildFallbackSpreadingFromExtractions(
    applicationId,
    borrower_name,
    eventsRes.rows,
  );
}

interface ExtractionRow {
  doc_id: string;
  doc_type: string;
  original_filename: string;
  page_count: number | null;
  extraction: { extracted_fields?: Record<string, unknown>; citations?: unknown[]; failed?: boolean } | null;
}

function buildFallbackSpreadingFromExtractions(
  application_id: string,
  borrower_name: string,
  rows: ExtractionRow[],
): unknown {
  const LINE_ITEMS: Array<{ path: string; label: string; cat: string }> = [
    { path: "income_statement.revenue", label: "Revenue", cat: "income_statement" },
    { path: "income_statement.cogs", label: "COGS", cat: "income_statement" },
    { path: "income_statement.ebitda", label: "EBITDA", cat: "income_statement" },
    { path: "income_statement.operating_income", label: "Operating income", cat: "income_statement" },
    { path: "income_statement.net_income", label: "Net income", cat: "income_statement" },
    { path: "income_statement.interest_expense", label: "Interest expense", cat: "income_statement" },
    { path: "balance_sheet.total_assets", label: "Total assets", cat: "balance_sheet" },
    { path: "balance_sheet.total_debt", label: "Total debt", cat: "balance_sheet" },
    { path: "balance_sheet.total_equity", label: "Total equity", cat: "balance_sheet" },
    { path: "balance_sheet.current_assets", label: "Current assets", cat: "balance_sheet" },
    { path: "balance_sheet.current_liabilities", label: "Current liabilities", cat: "balance_sheet" },
    { path: "cash_flow.operating_cash_flow", label: "Operating cash flow", cat: "cash_flow" },
    { path: "cash_flow.capex", label: "CapEx", cat: "cash_flow" },
    { path: "cash_flow.free_cash_flow", label: "Free cash flow", cat: "cash_flow" },
  ];

  // Use the first extracted doc's fiscal year as the primary year.
  const primary =
    rows
      .map((r) => (r.extraction?.extracted_fields as Record<string, unknown> | undefined)?.["fiscal_year_end"])
      .find((v): v is string => typeof v === "string") ?? "Unknown";

  const fiscal_years = [primary];

  const get = (obj: Record<string, unknown>, dotted: string): unknown => {
    let cur: unknown = obj;
    for (const part of dotted.split(".")) {
      if (cur && typeof cur === "object" && part in (cur as object)) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        return null;
      }
    }
    return cur;
  };

  const findCitation = (citations: unknown[], field_path: string) => {
    if (!Array.isArray(citations)) return null;
    for (const c of citations) {
      if (
        c &&
        typeof c === "object" &&
        (c as Record<string, unknown>).field_path === field_path
      ) {
        const cc = c as Record<string, unknown>;
        return {
          doc_id: "",
          page: typeof cc.page === "number" ? cc.page : 0,
          excerpt: typeof cc.excerpt === "string" ? cc.excerpt : null,
          bbox: Array.isArray(cc.bbox) ? cc.bbox : null,
        };
      }
    }
    return null;
  };

  const line_items = LINE_ITEMS.map((li) => {
    const raw: Record<string, unknown> = {};
    const normalized: Record<string, unknown> = {};
    for (const r of rows) {
      const ext = r.extraction;
      if (!ext || ext.failed) continue;
      const fields = ext.extracted_fields ?? {};
      const v = get(fields, li.path);
      if (v !== null && v !== undefined && Number.isFinite(Number(v))) {
        const cit = findCitation(ext.citations ?? [], li.path);
        if (cit) cit.doc_id = r.doc_id;
        const cell = { value: Number(v), citation: cit, human_edited: false };
        raw[primary] = cell;
        // Without the spreader we treat raw as normalized.
        normalized[primary] = cell;
        break;
      }
    }
    return {
      path: li.path,
      label: li.label,
      category: li.cat,
      is_critical: ["income_statement.revenue", "income_statement.ebitda", "balance_sheet.total_debt", "balance_sheet.total_assets"].includes(li.path),
      raw,
      normalized,
      adjustments: {},
    };
  });

  return {
    application_id,
    borrower_name,
    fiscal_years,
    primary_fiscal_year: primary,
    source_docs: rows.map((r) => ({
      doc_id: r.doc_id,
      doc_type: r.doc_type,
      original_filename: r.original_filename,
      page_count: r.page_count,
      fiscal_coverage: [primary],
    })),
    line_items,
    ratios: [], // No ratios until the spreader computes them
    scenarios: [],
    has_pending_edits: false,
    last_spread_at: null,
    spread_source: "raw-extraction-fallback",
  };
}


export async function getReturnNoticeArtifact(applicationId: string): Promise<unknown | null> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT body FROM application_artifacts
      WHERE application_id = $1 AND artifact_type = 'return_notice'
      ORDER BY revision_number DESC
      LIMIT 1`,
    [applicationId],
  );
  if (r.rows.length === 0) return null;
  return r.rows[0].body;
}


export async function getMemoArtifact(applicationId: string): Promise<MemoBody | null> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT body
     FROM application_artifacts
     WHERE application_id = $1 AND artifact_type = 'credit_memo'
     ORDER BY revision_number DESC
     LIMIT 1`,
    [applicationId],
  );
  if (r.rows.length === 0) return null;
  const raw = r.rows[0].body ?? null;
  let memo: MemoBody | null = null;
  if (raw && typeof raw === "object" && "memo" in raw && (raw as { memo?: unknown }).memo) {
    memo = (raw as { memo: MemoBody }).memo ?? null;
  } else {
    memo = raw as MemoBody | null;
  }
  if (!memo) return null;

  // Stub detection: only fall back to the curated LECO fixture if this is
  // clearly an orchestrator stub (synthesized=true) OR the memo is missing
  // both an executive summary text AND a recommendation. Real Gemini-produced
  // memos may have minor field gaps that section components must handle
  // gracefully — we no longer tolerate the fixture taking over a real run.
  const exec = memo.executive_summary;
  const hasExecText = !!(exec && (exec.text || exec.borrower_name));
  const hasRecommendation = !!memo.recommendation;
  const synthesizedFlag =
    (memo as unknown as { synthesized?: boolean }).synthesized === true;
  const isStub = synthesizedFlag || (!hasExecText && !hasRecommendation);
  if (isStub) {
    const { LECO_MEMO_FIXTURE } = await import("./memo-fixtures");
    return {
      ...LECO_MEMO_FIXTURE,
      application_id: applicationId,
      drafted_at: new Date().toISOString(),
    } as MemoBody;
  }

  return memo;
}

export async function getAuditTotals(applicationId: string): Promise<AuditTotals> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT
        COALESCE(SUM(latency_ms), 0)::bigint                                AS latency_ms,
        COALESCE(SUM(cost_usd), 0)                                          AS cost_usd,
        COUNT(*) FILTER (WHERE event_type = 'agent_action')                 AS agent_count,
        COUNT(*) FILTER (WHERE event_type = 'rule_evaluated')               AS rule_count,
        COUNT(*) FILTER (WHERE event_type = 'service_invoked')              AS service_count
     FROM application_events
     WHERE application_id = $1`,
    [applicationId],
  );
  const row = r.rows[0] ?? {};
  return {
    latencyMs: numOrUndef(row.latency_ms) ?? 0,
    costUsd: numOrUndef(row.cost_usd) ?? 0,
    agentCount: numOrUndef(row.agent_count) ?? 0,
    ruleCount: numOrUndef(row.rule_count) ?? 0,
    serviceCount: numOrUndef(row.service_count) ?? 0,
  };
}

// ── Legacy CaseRecord projection ─────────────────────────────────────────
//
// Existing components import `CaseRecord` and look up by `loan_id`. The new
// canonical id is `application_id`, but the demo wants the legacy shape so
// we don't have to rewrite every JSX file. `toCaseRecord` projects an
// ApplicationState (and optional memo + reasoning factors lifted out of the
// memo body) into the legacy CaseRecord interface.

const memoString = (m: MemoBody | null | undefined, key: string): string | undefined => {
  if (!m) return undefined;
  const v = (m as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
};

const memoArray = (m: MemoBody | null | undefined, key: string): string[] | undefined => {
  if (!m) return undefined;
  const v = (m as Record<string, unknown>)[key];
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
    return v as string[];
  }
  return undefined;
};

const memoFactors = (m: MemoBody | null | undefined): ReasoningFactor[] | undefined => {
  if (!m) return undefined;
  const v = (m as Record<string, unknown>).reasoning_factors;
  if (!Array.isArray(v)) return undefined;
  const out: ReasoningFactor[] = [];
  for (const f of v) {
    if (
      f &&
      typeof f === "object" &&
      typeof (f as { name?: unknown }).name === "string" &&
      typeof (f as { weight?: unknown }).weight === "number" &&
      typeof (f as { evidence?: unknown }).evidence === "string" &&
      typeof (f as { source?: unknown }).source === "string"
    ) {
      const fr = f as {
        name: string;
        weight: number;
        evidence: string;
        source: string;
        band?: ReasoningFactor["band"];
      };
      out.push({
        name: fr.name,
        weight: fr.weight,
        evidence: fr.evidence,
        source: fr.source,
        band: fr.band ?? "ok",
      });
    }
  }
  return out.length > 0 ? out : undefined;
};

const STAGE_DEFAULT_HOURS_TO_DEADLINE = 96;

export function toCaseRecord(
  state: ApplicationState,
  memo: MemoBody | null = null,
): CaseRecord {
  const startedAt = state.clock_started_at ?? state.created_at;
  const deadline =
    state.regulatory_deadline ??
    new Date(
      new Date(startedAt).getTime() + STAGE_DEFAULT_HOURS_TO_DEADLINE * 3600_000,
    ).toISOString();

  return {
    loan_id: state.application_id,
    application_id: state.application_id,
    borrower_id: state.borrower_id,
    borrower_name: state.borrower_name,
    scenario_id: state.scenario_tag ?? "live",
    description: memoString(memo, "description") ?? state.borrower_name,
    loan_amount_usd: state.loan_amount_usd,
    naics_code: state.naics_code,
    stage: state.current_stage,
    stage_entered_at: state.last_event_at,
    clock_started_at: startedAt,
    regulatory_deadline_ts: deadline,
    risk_band: state.risk_band ?? "1-pass",
    dscr_base: state.dscr_base,
    dscr_stressed: state.dscr_stressed,
    single_borrower_pct: state.single_borrower_pct,
    decision: state.decision ?? "APPROVE",
    rationale_summary:
      memoString(memo, "rationale_summary") ??
      memoString(memo, "summary") ??
      "Live case — see audit trail and credit memo for details.",
    decline_reasons: memoArray(memo, "decline_reasons"),
    return_reasons: memoArray(memo, "return_reasons"),
    suggested_revisions: memoArray(memo, "suggested_revisions"),
    approval_authority: memoString(memo, "approval_authority"),
    citation_density: state.citation_density,
    agent_confidence: state.agent_confidence,
    reasoning_factors: memoFactors(memo),
    stuck: state.stuck,
    alert: state.alert,
  };
}
