/**
 * Types for the pipeline-console app. Mirrors the contract emitted by the
 * BFF + the shape of the demo-data scenario JSON.
 */

import type {
  RiskBand,
  Stage,
  StageType,
  ReasoningFactor,
} from "@fsi-bank/components";

export type { RiskBand, Stage, StageType, ReasoningFactor };

export interface ConsoleConfig {
  console_pattern: string;
  use_case: string;
  persona: string;
  in_flight_label?: string;
  stages: ConfigStage[];
  stuck_detection?: {
    method: string;
    alert_after_pct: number;
    reason_field: string;
    panel_max_rows: number;
  };
  components: ConfigComponent[];
  currently_moving?: { enabled: boolean; max_rows: number };
  footer_actions?: ConfigFooterAction[];
  mobile?: { breakpoint_px: number; mode: string };
}

export interface ConfigStage {
  id: string;
  name: string;
  type: StageType;
  description?: string;
  duration_target_h: number;
  slo_h: number;
}

export interface ConfigComponent {
  type: string;
  order: number;
  config: Record<string, unknown>;
}

export interface ConfigFooterAction {
  id: string;
  label: string;
  action: string;
}

export type Decision =
  | "APPROVE"
  | "DECLINE"
  | "RETURN_FOR_REVISION"
  | "STALLED";

export interface CaseRecord {
  loan_id: string;
  application_id: string;
  borrower_id: string;
  borrower_name: string;
  scenario_id: string;
  description: string;
  loan_amount_usd: number;
  naics_code?: string;
  stage: string;
  stage_entered_at: string;
  /** ISO timestamp the regulatory clock started */
  clock_started_at: string;
  /** ISO timestamp the regulatory clock fires breach at */
  regulatory_deadline_ts: string;
  risk_band: RiskBand;
  industry_risk_band?: string;
  dscr_base?: number;
  dscr_stressed?: number;
  single_borrower_pct?: number;
  decision: Decision;
  rationale_summary: string;
  decline_reasons?: string[];
  return_reasons?: string[];
  suggested_revisions?: string[];
  approval_authority?: string;
  citation_density?: number;
  agent_confidence?: number;
  reasoning_factors?: ReasoningFactor[];
  stuck?: boolean;
  alert?: string;
}

export interface PipelineSnapshot {
  config: ConsoleConfig;
  cases: CaseRecord[];
  /** Stages enriched with a `count` derived from cases */
  stages: Stage[];
}

/**
 * Live `application_state` row, lightly converted (numerics → numbers,
 * timestamps → ISO strings) so it can travel over SSE without losing fidelity.
 *
 * This is the canonical shape now — `CaseRecord` (kept as an alias below) is
 * the legacy demo-data shape that some components still import. Where the
 * types diverge (e.g. `loan_id` vs `application_id`), `live-data.ts` projects
 * the DB row to a `CaseRecord` so the existing JSX continues to work.
 */
export interface ApplicationState {
  application_id: string;
  borrower_id: string;
  borrower_name: string;
  naics_code?: string;
  loan_amount_usd: number;
  scenario_tag?: string;
  current_stage: string;
  decision?: Decision;
  risk_band?: RiskBand;
  dscr_base?: number;
  dscr_stressed?: number;
  leverage_base?: number;
  single_borrower_pct?: number;
  agent_confidence?: number;
  citation_density?: number;
  regulatory_deadline?: string;
  clock_started_at?: string;
  stuck: boolean;
  alert?: string;
  created_at: string;
  updated_at: string;
  last_event_at: string;
}

/**
 * Single audit-trail row from `application_events`. The JSONB payload shape
 * varies by event_type; consumers typecheck what they need from `payload`.
 */
export interface AuditEvent {
  id: number;
  application_id: string;
  event_type:
    | "stage_entered"
    | "service_invoked"
    | "rule_evaluated"
    | "agent_action"
    | "decision_made"
    | "sink_completed"
    | string;
  service_name?: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  latency_ms?: number;
  cost_usd?: number;
}

/**
 * Credit memo body — JSONB stored in application_artifacts. The full shape
 * lives in usecases/credit-memo-commercial/schemas/credit_memo.schema.json;
 * the UI only needs an open-ended record here.
 */
export type MemoBody = Record<string, unknown>;

/** Roll-up totals for an audit trail, computed server-side. */
export interface AuditTotals {
  latencyMs: number;
  costUsd: number;
  agentCount: number;
  ruleCount: number;
  serviceCount: number;
}
