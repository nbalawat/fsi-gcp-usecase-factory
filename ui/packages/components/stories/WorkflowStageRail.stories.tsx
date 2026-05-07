import type { Meta, StoryObj } from "@storybook/react";
import { WorkflowStageRail } from "../src/WorkflowStageRail";

const meta: Meta<typeof WorkflowStageRail> = {
  title: "Pipeline/WorkflowStageRail",
  component: WorkflowStageRail,
};
export default meta;

type Story = StoryObj<typeof WorkflowStageRail>;

export const CreditMemoStages: Story = {
  args: {
    currentStage: "approval",
    stages: [
      { id: "intake", name: "Intake", type: "agent", count: 3, slo: 2 },
      { id: "spreading", name: "Spreading", type: "agent", count: 5, slo: 8 },
      { id: "rating", name: "Rating", type: "agent", count: 2, slo: 4 },
      { id: "drafting", name: "Drafting", type: "agent", count: 4, slo: 4 },
      {
        id: "approval",
        name: "Approval",
        type: "human",
        count: 6,
        slo: 120,
        stuckCount: 2,
      },
      { id: "posted", name: "Posted", type: "auto", count: 1, slo: 1 },
    ],
  },
};
