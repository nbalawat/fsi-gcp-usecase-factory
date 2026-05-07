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
