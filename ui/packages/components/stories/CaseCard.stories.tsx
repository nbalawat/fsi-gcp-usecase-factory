import type { Meta, StoryObj } from "@storybook/react";
import { CaseCard } from "../src/CaseCard";

const meta: Meta<typeof CaseCard> = {
  title: "Pipeline/CaseCard",
  component: CaseCard,
};
export default meta;

type Story = StoryObj<typeof CaseCard>;

export const HappyPath: Story = {
  args: {
    id: "DEMO-APP-MFG-001-2026",
    borrowerId: "DEMO-MFG-001",
    borrowerName: "Acme Manufacturing",
    stage: "approval",
    riskBand: "1-pass",
    dscr: 3.82,
    loanAmountUsd: 8_000_000,
    conf: 0.94,
  },
};

export const Stuck: Story = {
  args: {
    id: "DEMO-APP-HLT-002-2026",
    borrowerId: "DEMO-HLT-002",
    borrowerName: "Ridgecrest Health (stalled)",
    stage: "spreading",
    riskBand: "2-special-mention",
    loanAmountUsd: 12_000_000,
    stuck: true,
    alert: "Doc IQ timeout",
  },
};

export const Substandard: Story = {
  args: {
    id: "DEMO-APP-MFG-002-2026",
    borrowerId: "DEMO-MFG-002",
    borrowerName: "Northbridge Metals",
    stage: "rating",
    riskBand: "3-substandard",
    dscr: 0.98,
    loanAmountUsd: 5_000_000,
    conf: 0.81,
  },
};
