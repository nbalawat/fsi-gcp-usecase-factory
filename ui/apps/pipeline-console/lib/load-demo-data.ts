import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  CaseRecord,
  ConsoleConfig,
  Decision,
  PipelineSnapshot,
  RiskBand,
} from "./types";
import type { Stage, ReasoningFactor } from "@fsi-bank/components";

const REPO_ROOT = join(process.cwd(), "..", "..", "..");

interface RawScenario {
  scenario_id: string;
  description: string;
  borrower_id: string;
  application_id: string;
  expected_outcome: {
    decision?: string;
    pipeline_status?: string;
    risk_band?: string;
    approval_authority?: string;
    decline_reasons?: string[];
    return_reasons?: string[];
    suggested_revisions?: string[];
    regulatory_clock_breach?: boolean;
  };
  pipeline_steps?: Array<{ step: string; expected: string }>;
  injected_exposure_state?: {
    single_borrower_pct_post_close?: number;
    proposed_new_usd?: number;
  };
  clock_simulation?: {
    application_submitted_at?: string;
    simulated_clock_breach_at?: string;
  };
  trailing_quarter_data?: Record<string, unknown>;
}

const decisionMap: Record<string, Decision> = {
  approved: "APPROVE",
  declined: "DECLINE",
  returned: "RETURN_FOR_REVISION",
  STALLED: "STALLED",
  stalled: "STALLED",
};

const stageForScenario = (raw: RawScenario): string => {
  // Stuck case → still in spreading; everyone else → in approval where the
  // human acts. The drafter has finished by the time it surfaces here.
  if (raw.scenario_id === "regulatory-clock-breach-alarm") return "spreading";
  if (raw.expected_outcome.decision === "approved") return "approval";
  if (raw.expected_outcome.decision === "declined") return "approval";
  if (raw.expected_outcome.decision === "returned") return "approval";
  return "approval";
};

// Loan amounts and friendly borrower names — derived from the scenarios but
// kept compact here so the demo renders reasonable currency values.
const borrowerProfile: Record<
  string,
  { name: string; loan_amount_usd: number; naics_code: string }
> = {
  "DEMO-MFG-001": {
    name: "Acme Manufacturing",
    loan_amount_usd: 8_000_000,
    naics_code: "332",
  },
  "DEMO-MFG-002": {
    name: "Northbridge Metals",
    loan_amount_usd: 5_000_000,
    naics_code: "331",
  },
  "DEMO-HLT-001": {
    name: "Ridgecrest Health",
    loan_amount_usd: 15_000_000,
    naics_code: "622",
  },
  "DEMO-HLT-002": {
    name: "Lighthouse Health",
    loan_amount_usd: 12_000_000,
    naics_code: "622",
  },
  "DEMO-RET-001": {
    name: "Summit Outfitters",
    loan_amount_usd: 9_000_000,
    naics_code: "451",
  },
};

const ratiosFor = (
  raw: RawScenario,
): {
  dscr_base?: number;
  dscr_stressed?: number;
  single_borrower_pct?: number;
} => {
  switch (raw.scenario_id) {
    case "happy-path-approve":
      return { dscr_base: 3.82, dscr_stressed: 2.94, single_borrower_pct: 1.3 };
    case "exposure-limit-decline":
      return { dscr_base: 4.28, dscr_stressed: 3.6, single_borrower_pct: 8.65 };
    case "rated-substandard-decline":
      return { dscr_base: 0.98, dscr_stressed: 0.72, single_borrower_pct: 0.6 };
    case "covenant-projection-violation-return-for-revision":
      return { dscr_base: 3.18, dscr_stressed: 1.18, single_borrower_pct: 1.0 };
    case "regulatory-clock-breach-alarm":
      return { single_borrower_pct: 1.4 };
    default:
      return {};
  }
};

const reasoningForScenario = (raw: RawScenario): ReasoningFactor[] => {
  switch (raw.scenario_id) {
    case "happy-path-approve":
      return [
        {
          name: "DSCR base",
          weight: 0.3,
          evidence: "DSCR 3.82x — well above 1.25x covenant minimum.",
          source: "svc-dscr-calculator",
          band: "ok",
        },
        {
          name: "Leverage",
          weight: 0.25,
          evidence: "Debt / EBITDA 1.76x — first quartile vs NAICS 332 peers.",
          source: "svc-financial-spreader",
          band: "ok",
        },
        {
          name: "Industry risk",
          weight: 0.15,
          evidence: "NAICS 332 fabricated metals — moderate; cyclical flag.",
          source: "svc-industry-risk-scorer",
          band: "warning",
        },
        {
          name: "Single-borrower exposure",
          weight: 0.3,
          evidence: "Exposure 1.3% of Tier 1 — far below 8% limit.",
          source: "svc-exposure-aggregator",
          band: "ok",
        },
      ];
    case "exposure-limit-decline":
      return [
        {
          name: "Credit quality",
          weight: 0.4,
          evidence: "DSCR 4.28x; leverage 1.92x — strong BBB+ credit.",
          source: "svc-financial-spreader",
          band: "ok",
        },
        {
          name: "Single-borrower exposure",
          weight: 0.6,
          evidence:
            "Post-close 8.65% of Tier 1 — exceeds 8.0% OCC 12 CFR 32 limit.",
          source: "svc-exposure-aggregator",
          band: "critical",
        },
      ];
    case "rated-substandard-decline":
      return [
        {
          name: "DSCR base",
          weight: 0.3,
          evidence: "0.98x post-close — below 1.10 covenant minimum.",
          source: "svc-dscr-calculator",
          band: "critical",
        },
        {
          name: "Leverage",
          weight: 0.2,
          evidence: "Post-close 4.95x — above 4.5x covenant max.",
          source: "svc-financial-spreader",
          band: "critical",
        },
        {
          name: "Audit quality",
          weight: 0.1,
          evidence: "Compiled (unaudited) financials — reliance caveat.",
          source: "agent-extractor",
          band: "warning",
        },
        {
          name: "PE overhang",
          weight: 0.2,
          evidence: "PE leverage not captured in bank debt; hidden risk.",
          source: "svc-industry-risk-scorer",
          band: "warning",
        },
        {
          name: "Relationship",
          weight: 0.2,
          evidence: "3-year banking relationship — limited credit history.",
          source: "borrower-master",
          band: "warning",
        },
      ];
    case "covenant-projection-violation-return-for-revision":
      return [
        {
          name: "Annual DSCR",
          weight: 0.3,
          evidence: "Full-year DSCR 3.18x — strong.",
          source: "svc-dscr-calculator",
          band: "ok",
        },
        {
          name: "Q3 trough DSCR",
          weight: 0.4,
          evidence:
            "Trough 1.18x in October — below proposed 1.25 minimum covenant.",
          source: "svc-covenant-analyzer",
          band: "critical",
        },
        {
          name: "Suggested revision",
          weight: 0.3,
          evidence:
            "Q3 step-down or fiscal-year-end measurement removes seasonal noise.",
          source: "agent-drafter",
          band: "warning",
        },
      ];
    case "regulatory-clock-breach-alarm":
      return [
        {
          name: "Pipeline stall",
          weight: 0.6,
          evidence:
            "agent-extractor timed out; retries exhausted; DLQ entry created.",
          source: "agent-extractor",
          band: "critical",
        },
        {
          name: "Clock state",
          weight: 0.4,
          evidence: "5 business days elapsed; no decision communicated.",
          source: "regulatory-clock-fragment",
          band: "critical",
        },
      ];
    default:
      return [];
  }
};

const rationaleFor = (raw: RawScenario): string => {
  switch (raw.scenario_id) {
    case "happy-path-approve":
      return "Strong DSCR (3.82x), conservative leverage, 12-year banking relationship. No threshold breaches; exposure 1.3% of Tier 1.";
    case "exposure-limit-decline":
      return "Credit quality strong (BBB+), but single-borrower exposure post-close 8.65% breaches OCC 12 CFR 32 8.0% Tier 1 limit. Decline driven by regulatory limit, not credit quality.";
    case "rated-substandard-decline":
      return "Risk band 3-substandard. DSCR 0.98 below covenant minimum; leverage 4.95x above maximum; PE overhang and unaudited financials.";
    case "covenant-projection-violation-return-for-revision":
      return "Strong full-year credit, but proposed 1.25 minimum DSCR projects breach in Q3 seasonal trough (1.18). Restructure covenant before re-submission.";
    case "regulatory-clock-breach-alarm":
      return "Pipeline stalled at agent-extractor; OCC 5-business-day clock breached. Compliance escalation required.";
    default:
      return raw.description;
  }
};

const computeClockTimes = (
  raw: RawScenario,
  decision: Decision,
): { startedAt: string; deadline: string } => {
  // We pin the clock to "today" so the demo shows a useful countdown.
  // For the breach scenario, push the start back so it's already breached.
  const now = new Date();
  if (raw.scenario_id === "regulatory-clock-breach-alarm") {
    const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); // 6d ago
    const end = new Date(now.getTime() - 18 * 60 * 60 * 1000); // 18h ago
    return { startedAt: start.toISOString(), deadline: end.toISOString() };
  }
  // Default: started 1 day ago, deadline 4 business days from now.
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  // Decline scenarios put the clock under more pressure
  if (decision === "DECLINE") {
    end.setTime(now.getTime() + 18 * 60 * 60 * 1000); // ~18h
  }
  return { startedAt: start.toISOString(), deadline: end.toISOString() };
};

const stageEnteredFor = (
  scenarioId: string,
  stage: string,
): string => {
  const now = new Date();
  if (scenarioId === "regulatory-clock-breach-alarm") {
    return new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (stage === "approval") {
    return new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
};

const buildLoanId = (raw: RawScenario): string => raw.application_id;

const ensureRiskBand = (s: string | undefined): RiskBand => {
  const bands: RiskBand[] = [
    "1-pass",
    "2-special-mention",
    "3-substandard",
    "4-doubtful",
    "5-loss",
  ];
  return (bands.find((b) => b === s) ?? "1-pass") as RiskBand;
};

const buildCase = (raw: RawScenario): CaseRecord => {
  const profile = borrowerProfile[raw.borrower_id];
  const ratios = ratiosFor(raw);
  const stage = stageForScenario(raw);
  const decisionRaw =
    raw.expected_outcome.decision ??
    raw.expected_outcome.pipeline_status ??
    "approved";
  const decision = decisionMap[decisionRaw] ?? "APPROVE";
  const { startedAt, deadline } = computeClockTimes(raw, decision);
  const stuck = decision === "STALLED";

  return {
    loan_id: buildLoanId(raw),
    application_id: raw.application_id,
    borrower_id: raw.borrower_id,
    borrower_name: profile?.name ?? raw.borrower_id,
    scenario_id: raw.scenario_id,
    description: raw.description,
    loan_amount_usd: profile?.loan_amount_usd ?? 5_000_000,
    naics_code: profile?.naics_code,
    stage,
    stage_entered_at: stageEnteredFor(raw.scenario_id, stage),
    clock_started_at: startedAt,
    regulatory_deadline_ts: deadline,
    risk_band: ensureRiskBand(raw.expected_outcome.risk_band),
    dscr_base: ratios.dscr_base,
    dscr_stressed: ratios.dscr_stressed,
    single_borrower_pct: ratios.single_borrower_pct,
    decision,
    rationale_summary: rationaleFor(raw),
    decline_reasons: raw.expected_outcome.decline_reasons,
    return_reasons: raw.expected_outcome.return_reasons,
    suggested_revisions: raw.expected_outcome.suggested_revisions,
    approval_authority: raw.expected_outcome.approval_authority,
    citation_density: 0.88,
    agent_confidence: stuck ? 0.42 : 0.92,
    reasoning_factors: reasoningForScenario(raw),
    stuck,
    alert: stuck
      ? "Doc IQ timeout"
      : raw.scenario_id === "exposure-limit-decline"
        ? "Exposure 8.65%"
        : raw.scenario_id === "covenant-projection-violation-return-for-revision"
          ? "Q3 trough projected"
          : undefined,
  };
};

/**
 * Reads every JSON scenario under
 *   usecases/<uc>/demo-data/scenarios/*.json
 * and returns them as typed CaseRecords.
 */
export function loadCases(useCase: string): CaseRecord[] {
  const dir = join(REPO_ROOT, "usecases", useCase, "demo-data", "scenarios");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as RawScenario;
      return buildCase(raw);
    })
    .sort((a, b) => a.loan_id.localeCompare(b.loan_id));
}

/**
 * Joins loaded cases against the configured stages to produce a
 * pipeline-ready snapshot for the page.
 */
export function buildSnapshot(
  config: ConsoleConfig,
  cases: CaseRecord[],
): PipelineSnapshot {
  const counts = new Map<string, number>();
  const stuckCounts = new Map<string, number>();
  for (const c of cases) {
    counts.set(c.stage, (counts.get(c.stage) ?? 0) + 1);
    if (c.stuck) {
      stuckCounts.set(c.stage, (stuckCounts.get(c.stage) ?? 0) + 1);
    }
  }
  const stages: Stage[] = config.stages.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    count: counts.get(s.id) ?? 0,
    slo: s.slo_h,
    stuckCount: stuckCounts.get(s.id) ?? 0,
  }));
  return { config, cases, stages };
}
