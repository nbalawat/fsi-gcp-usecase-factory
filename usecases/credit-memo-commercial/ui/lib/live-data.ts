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
