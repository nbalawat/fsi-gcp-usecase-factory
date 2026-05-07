import type { Meta, StoryObj } from "@storybook/react";
import { BreadcrumbNav } from "../src/BreadcrumbNav";

const meta: Meta<typeof BreadcrumbNav> = {
  title: "Pipeline/BreadcrumbNav",
  component: BreadcrumbNav,
};
export default meta;

type Story = StoryObj<typeof BreadcrumbNav>;

export const TopLevel: Story = {
  args: {
    usecase: "credit-memo-commercial",
    usecaseLabel: "Credit Memo (Commercial)",
  },
};

export const InsideCase: Story = {
  args: {
    usecase: "credit-memo-commercial",
    usecaseLabel: "Credit Memo (Commercial)",
    stage: "approval",
    borrowerName: "Acme Manufacturing",
    caseId: "DEMO-APP-MFG-001-2026",
  },
};
