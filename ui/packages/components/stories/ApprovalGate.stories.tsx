import type { Meta, StoryObj } from "@storybook/react";
import { ApprovalGate } from "../src/ApprovalGate";

const meta: Meta<typeof ApprovalGate> = {
  title: "Pipeline/ApprovalGate",
  component: ApprovalGate,
};
export default meta;

type Story = StoryObj<typeof ApprovalGate>;

const noop = (): void => {};

export const Approve: Story = {
  args: {
    caseId: "DEMO-APP-MFG-001-2026",
    recommendation: {
      decision: "APPROVE",
      riskBand: "1-pass",
      approvalAuthority: "senior-credit-committee",
      rationaleSummary:
        "Strong DSCR (3.82x), conservative leverage, 12-year banking relationship. No threshold breaches; exposure 1.3% of Tier 1.",
      irrevocable: true,
    },
    onAccept: noop,
    onEdit: noop,
    onReject: noop,
  },
};

export const ReturnForRevision: Story = {
  args: {
    caseId: "DEMO-APP-RET-001-2026",
    recommendation: {
      decision: "RETURN_FOR_REVISION",
      riskBand: "2-special-mention",
      rationaleSummary:
        "Proposed Min DSCR 1.25 projects breach in Q3 seasonal trough (1.18). Restructure covenant before approval.",
      irrevocable: false,
    },
    onAccept: noop,
    onEdit: noop,
    onReject: noop,
  },
};
