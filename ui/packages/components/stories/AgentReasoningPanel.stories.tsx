import type { Meta, StoryObj } from "@storybook/react";
import { AgentReasoningPanel } from "../src/AgentReasoningPanel";

const meta: Meta<typeof AgentReasoningPanel> = {
  title: "Pipeline/AgentReasoningPanel",
  component: AgentReasoningPanel,
};
export default meta;

type Story = StoryObj<typeof AgentReasoningPanel>;

export const RaterOutput: Story = {
  args: {
    step: "rater",
    confidence: 0.92,
    citationDensity: 0.88,
    rationale:
      "Risk band 1-pass: strong cash generation, conservative leverage, long banking relationship.",
    factors: [
      {
        name: "DSCR (base)",
        weight: 0.3,
        evidence: "DSCR base 3.82x — well above 1.25x covenant minimum.",
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
        name: "Exposure",
        weight: 0.3,
        evidence:
          "Single-borrower exposure 1.3% of Tier 1 — far below 8% limit.",
        source: "svc-exposure-aggregator",
        band: "ok",
      },
    ],
  },
};
