import type { Meta, StoryObj } from "@storybook/react";
import { MetricStrip } from "../src/MetricStrip";

const meta: Meta<typeof MetricStrip> = {
  title: "Pipeline/MetricStrip",
  component: MetricStrip,
};
export default meta;

type Story = StoryObj<typeof MetricStrip>;

export const CreditMemoKPIs: Story = {
  args: {
    metrics: [
      { id: "dscr", label: "Avg DSCR", value: "2.41", unit: "x", trend: 1 },
      {
        id: "debt_ebitda",
        label: "Debt / EBITDA",
        value: "3.4",
        unit: "x",
        trend: 0,
      },
      {
        id: "leverage",
        label: "Leverage",
        value: "38.1",
        unit: "%",
        trend: -1,
      },
      {
        id: "exposure",
        label: "Exposure %",
        value: "8.65",
        unit: "%",
        state: "alert",
        trend: 1,
      },
      {
        id: "remaining",
        label: "Time Remaining",
        value: "06",
        unit: "h",
        state: "warning",
      },
    ],
  },
};
