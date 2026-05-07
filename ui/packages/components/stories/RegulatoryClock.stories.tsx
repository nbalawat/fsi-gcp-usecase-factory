import type { Meta, StoryObj } from "@storybook/react";
import { RegulatoryClock } from "../src/RegulatoryClock";

const meta: Meta<typeof RegulatoryClock> = {
  title: "Pipeline/RegulatoryClock",
  component: RegulatoryClock,
};
export default meta;

type Story = StoryObj<typeof RegulatoryClock>;

const NOW = new Date("2026-04-26T12:00:00Z");

export const Healthy: Story = {
  args: {
    regulatoryRegime: "OCC 5-business-day",
    startedAt: "2026-04-25T08:00:00Z",
    deadline: "2026-04-30T17:00:00Z",
    now: NOW,
  },
};

export const Amber: Story = {
  args: {
    regulatoryRegime: "OCC 5-business-day",
    startedAt: "2026-04-22T14:15:00Z",
    deadline: "2026-04-27T01:00:00Z",
    now: NOW,
  },
};

export const Breach: Story = {
  args: {
    regulatoryRegime: "OCC 5-business-day",
    startedAt: "2026-04-22T14:15:00Z",
    deadline: "2026-04-25T17:00:00Z",
    now: NOW,
  },
};
