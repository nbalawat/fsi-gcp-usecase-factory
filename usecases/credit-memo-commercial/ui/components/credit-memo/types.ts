/**
 * Local TypeScript shapes that mirror
 * `usecases/credit-memo-commercial/schemas/credit_memo.schema.json`.
 *
 * The DB stores the memo body as `application_artifacts.body` JSONB and the
 * pipeline-console reads it via `getMemoArtifact()`. We type it here so the
 * renderer can pull fields with full IntelliSense without re-importing the
 * schema at runtime.
 */
export type RiskBand =
  | "1-pass"
  | "2-special-mention"
  | "3-substandard"
  | "4-doubtful"
  | "5-loss";

export type DecisionAction =
  | "approve"
  | "approve_conditional"
  | "decline"
  | "return_for_revision";

export type ApprovalAuthority =
  | "relationship_manager"
  | "senior_credit_officer"
  | "senior_credit_committee"
  | "board_credit_committee"
  | "full_board";

export interface Citation {
  source: string;
  page?: number | null;
  section?: string | null;
  excerpt?: string;
  claim: string;
  kind?:
    | "10-K_page"
    | "10-Q_page"
    | "audited_financials"
    | "peer_table"
    | "regulation"
    | "service_output"
    | "agent_output"
    | "internal_policy"
    | "court_filing"
    | "appraisal"
    | "other";
  url?: string | null;
}

export interface ExecutiveSummary {
  text: string;
  borrower_name: string;
  industry: string;
  loan_request: {
    amount_usd: number;
    term_years: number;
    facility_type:
      | "term_loan"
      | "revolver"
      | "line_of_credit"
      | "construction"
      | "mortgage"
      | "other";
    pricing?: string | null;
  };
  risk_rating: RiskBand;
  recommendation_action: DecisionAction;
  highlights: string[];
  citations?: Citation[];
}

export interface BorrowerOverview {
  business_description: string;
  ownership: Array<{
    name: string;
    stake_pct: number;
    role: string;
    is_insider?: boolean;
  }>;
  management_team: Array<{
    role: "CEO" | "CFO" | "COO" | "CRO" | "GC" | "President" | "Other";
    name: string;
    tenure_years: number;
    background?: string;
  }>;
  customer_concentration: {
    top_1_pct: number;
    top_5_pct: number;
    hhi?: number | null;
    narrative?: string;
  };
  supplier_concentration?: {
    top_1_pct?: number;
    narrative?: string;
  };
  related_party_transactions?: string[];
  citations?: Citation[];
}

export interface FinancialAnalysis {
  normalization_adjustments: Array<{
    period: string;
    line_item: string;
    original_value: number;
    adjusted_value: number;
    rationale: string;
    citation?: Citation;
  }>;
  trend_table: {
    periods: string[];
    rows: Array<{
      metric: string;
      values: Array<number | string | null>;
      trend?: string;
    }>;
  };
  peer_comparison: {
    peer_set_id: string;
    naics_code: string;
    peer_count?: number | null;
    data_source?: string;
    rows: Array<{
      metric: string;
      borrower: number | string;
      median: number | string;
      p25?: number | string | null;
      p75?: number | string | null;
      borrower_assessment?: string;
    }>;
  };
  narrative: string;
  citations?: Citation[];
}

export interface CashFlowProjection {
  assumptions?: {
    revenue_cagr?: number;
    ebitda_margin?: number;
    capex_pct_revenue?: number;
    working_capital_days?: {
      dso?: number;
      dpo?: number;
      inventory_days?: number;
    };
    narrative?: string;
  };
  scenarios: Array<{
    name:
      | "base"
      | "downside"
      | "recession"
      | "recession_plus_200bps"
      | "rate_shock_only"
      | "custom";
    label?: string;
    revenue_cagr: number;
    ebitda_margin: number;
    rate_shock_bps: number;
    year_3: {
      revenue_usd: number;
      ebitda_usd: number;
      annual_debt_service_usd: number;
      dscr: number;
      leverage: number;
      covenant_headroom_dscr_pct: number;
    };
    interpretation?: string;
  }>;
  narrative: string;
  citations?: Citation[];
}

export interface RiskFactor {
  name: string;
  severity_1_10: number;
  evidence: string;
  mitigation: string;
  citations?: Citation[];
}

export interface RiskFactors {
  factors: RiskFactor[];
}

export interface CollateralItem {
  type:
    | "real_estate"
    | "equipment"
    | "accounts_receivable"
    | "inventory"
    | "cash"
    | "marketable_securities"
    | "other";
  description?: string;
  appraised_value_usd: number;
  haircut_pct: number;
  lendable_value_usd: number;
  lien_position?: "first" | "second" | "shared_first" | "subordinated";
  regulation?: string;
  citation?: Citation;
}

export interface Collateral {
  items: CollateralItem[];
  total_pledged_usd: number;
  loan_amount_usd: number;
  coverage_pct: number;
  narrative?: string;
}

export interface CovenantPackage {
  maintenance_covenants: Array<{
    name:
      | "DSCR_floor"
      | "leverage_cap"
      | "current_ratio_floor"
      | "fixed_charge_coverage_floor"
      | "capex_cap"
      | "tangible_net_worth_floor"
      | "minimum_liquidity";
    threshold: number;
    threshold_unit?: "x" | "pct" | "usd";
    test_frequency: "quarterly" | "annually" | "semi_annually" | "monthly";
    grace_period_days?: number;
    headroom_pct_at_base?: number;
    rationale?: string;
  }>;
  incurrence_covenants?: Array<{
    name: string;
    applies_when: string;
    threshold?: number | string | null;
  }>;
  reporting_cadence: string;
  narrative?: string;
  citations?: Citation[];
}

export interface RegulatoryConcentration {
  single_borrower_limit: {
    total_exposure_usd: number;
    tier1_capital_usd: number;
    exposure_pct: number;
    cap_pct: number;
    compliant: boolean;
    regulation?: string;
  };
  reg_o_check: {
    is_insider: boolean;
    related_to?: string | null;
    insider_match_confidence?: number;
    board_approval_required: boolean;
    estimated_board_meeting?: string | null;
    regulation?: string;
  };
  appraisal_check?: {
    required?: boolean;
    regulation?: string;
    rationale?: string;
  };
  fair_lending: {
    pricing_within_band: boolean;
    delta_bps_vs_peers: number;
    regulation?: string;
  };
  bsa_aml_ofac?: {
    ofac_clear?: boolean;
    kyc_complete?: boolean;
    screening_notes?: string;
  };
  citations?: Citation[];
}

export interface RiskRatingRationale {
  risk_band: RiskBand;
  drivers: Array<{
    factor: string;
    assessment: "strong" | "adequate" | "weak" | "concerning";
    evidence: string;
    citation?: Citation;
  }>;
  identified_weaknesses?: Array<{
    weakness: string;
    mitigation: string;
  }>;
  occ_handbook_citation?: string;
  narrative?: string;
}

export interface Recommendation {
  action: DecisionAction;
  approval_authority?: ApprovalAuthority;
  terms: {
    amount_usd: number;
    rate: string;
    term_years: number;
    amortization_years?: number | null;
    balloon_at_maturity?: boolean;
    origination_fee_pct?: number;
    annual_fee_bps?: number | null;
    prepayment?: string;
    draws?: string;
  };
  conditions_precedent: string[];
  narrative?: string;
}

export interface CreditMemoBody {
  version: string;
  application_id: string;
  borrower_id: string;
  drafted_at: string;
  drafted_by: string;
  revision_number?: number;
  review_status?: "draft" | "reviewed" | "approved" | "revise";
  executive_summary: ExecutiveSummary;
  borrower_overview: BorrowerOverview;
  financial_analysis: FinancialAnalysis;
  cash_flow_projection: CashFlowProjection;
  risk_factors: RiskFactors;
  collateral: Collateral;
  covenant_package: CovenantPackage;
  regulatory_concentration: RegulatoryConcentration;
  risk_rating_rationale: RiskRatingRationale;
  recommendation: Recommendation;
  citation_density?: number;
  appendices?: Record<string, unknown>;
}

/** The 10 in-order section keys, used by TOC + scroll-spy. */
export const SECTION_ORDER = [
  "executive_summary",
  "borrower_overview",
  "financial_analysis",
  "cash_flow_projection",
  "risk_factors",
  "collateral",
  "covenant_package",
  "regulatory_concentration",
  "risk_rating_rationale",
  "recommendation",
] as const;

export type SectionKey = (typeof SECTION_ORDER)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  executive_summary: "Executive Summary",
  borrower_overview: "Borrower Overview",
  financial_analysis: "Financial Analysis",
  cash_flow_projection: "Cash Flow Projection",
  risk_factors: "Risk Factors",
  collateral: "Collateral",
  covenant_package: "Covenant Package",
  regulatory_concentration: "Regulatory & Concentration",
  risk_rating_rationale: "Risk Rating Rationale",
  recommendation: "Recommendation",
};
