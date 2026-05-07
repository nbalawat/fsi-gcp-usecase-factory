import type { Meta, StoryObj } from "@storybook/react";
import { BreadcrumbNav } from "../src/BreadcrumbNav";
import { MetricStrip } from "../src/MetricStrip";
import { WorkflowStageRail } from "../src/WorkflowStageRail";
import { CaseCard } from "../src/CaseCard";
import { AgentReasoningPanel } from "../src/AgentReasoningPanel";
import { RegulatoryClock } from "../src/RegulatoryClock";
import { ApprovalGate } from "../src/ApprovalGate";

/**
 * Composition story — credit-memo-commercial happy path. Mirrors what
 * the pipeline-console app builds from console.yaml + scenarios.
 */
const meta: Meta = {
  title: "Pipeline/Composition · credit-memo-commercial happy path",
};
export default meta;

const NOW = new Date("2026-04-26T12:00:00Z");
const noop = (): void => {};

export const HappyPath: StoryObj = {
  render: () => (
    <div className="flex min-h-screen flex-col bg-surface-canvas">
      <BreadcrumbNav
        usecase="credit-memo-commercial"
        usecaseLabel="Credit Memo (Commercial)"
        stage="approval"
        borrowerName="Acme Manufacturing"
        caseId="DEMO-APP-MFG-001-2026"
      />
      <MetricStrip
        metrics={[
          { id: "dscr", label: "Avg DSCR", value: "2.41", unit: "x", trend: 1 },
          {
            id: "debt_ebitda",
            label: "Debt / EBITDA",
            value: "3.4",
            unit: "x",
          },
          { id: "leverage", label: "Leverage", value: "38.1", unit: "%" },
          {
            id: "exposure",
            label: "Exposure %",
            value: "8.65",
            unit: "%",
            state: "alert",
          },
          {
            id: "remaining",
            label: "Time Remaining",
            value: "26",
            unit: "h",
            state: "warning",
          },
        ]}
      />
      <WorkflowStageRail
        currentStage="approval"
        stages={[
          { id: "intake", name: "Intake", type: "agent", count: 3, slo: 2 },
          {
            id: "spreading",
            name: "Spreading",
            type: "agent",
            count: 5,
            slo: 8,
          },
          { id: "rating", name: "Rating", type: "agent", count: 2, slo: 4 },
          {
            id: "drafting",
            name: "Drafting",
            type: "agent",
            count: 4,
            slo: 4,
          },
          {
            id: "approval",
            name: "Approval",
            type: "human",
            count: 6,
            slo: 120,
            stuckCount: 2,
          },
          { id: "posted", name: "Posted", type: "auto", count: 1, slo: 1 },
        ]}
      />
      <main className="grid gap-4 p-6 lg:grid-cols-[2fr,1fr]">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Cases in approval
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <CaseCard
              id="DEMO-APP-MFG-001-2026"
              borrowerId="DEMO-MFG-001"
              borrowerName="Acme Manufacturing"
              stage="approval"
              riskBand="1-pass"
              dscr={3.82}
              loanAmountUsd={8_000_000}
              conf={0.94}
            />
            <CaseCard
              id="DEMO-APP-HLT-001-2026"
              borrowerId="DEMO-HLT-001"
              borrowerName="Ridgecrest Health"
              stage="approval"
              riskBand="1-pass"
              dscr={4.28}
              loanAmountUsd={15_000_000}
              alert="Exposure 8.65%"
            />
            <CaseCard
              id="DEMO-APP-MFG-002-2026"
              borrowerId="DEMO-MFG-002"
              borrowerName="Northbridge Metals"
              stage="approval"
              riskBand="3-substandard"
              dscr={0.98}
              loanAmountUsd={5_000_000}
            />
            <CaseCard
              id="DEMO-APP-HLT-002-2026"
              borrowerId="DEMO-HLT-002"
              borrowerName="Ridgecrest Health (stalled)"
              stage="spreading"
              riskBand="2-special-mention"
              loanAmountUsd={12_000_000}
              stuck
              alert="Doc IQ timeout"
            />
          </div>
          <AgentReasoningPanel
            step="rater"
            confidence={0.92}
            citationDensity={0.88}
            rationale="Risk band 1-pass: strong cash generation, conservative leverage."
            factors={[
              {
                name: "DSCR base",
                weight: 0.3,
                evidence: "3.82x — above 1.25x covenant min.",
                source: "svc-dscr-calculator",
                band: "ok",
              },
              {
                name: "Exposure",
                weight: 0.3,
                evidence: "1.3% of Tier 1 — well within limit.",
                source: "svc-exposure-aggregator",
                band: "ok",
              },
            ]}
          />
        </div>
        <aside className="flex flex-col gap-3">
          <RegulatoryClock
            regulatoryRegime="OCC 5-business-day"
            startedAt="2026-04-25T08:00:00Z"
            deadline="2026-04-30T17:00:00Z"
            now={NOW}
          />
          <ApprovalGate
            caseId="DEMO-APP-MFG-001-2026"
            recommendation={{
              decision: "APPROVE",
              riskBand: "1-pass",
              approvalAuthority: "senior-credit-committee",
              rationaleSummary:
                "Strong DSCR, conservative leverage, 12-year relationship.",
              irrevocable: true,
            }}
            onAccept={noop}
            onEdit={noop}
            onReject={noop}
          />
        </aside>
      </main>
    </div>
  ),
};
