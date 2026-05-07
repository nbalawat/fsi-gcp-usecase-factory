import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowStageRail } from "../src/WorkflowStageRail";

const stages = [
  { id: "intake", name: "Intake", type: "agent" as const, count: 3, slo: 2 },
  {
    id: "approval",
    name: "Approval",
    type: "human" as const,
    count: 6,
    slo: 120,
    stuckCount: 2,
  },
  { id: "posted", name: "Posted", type: "auto" as const, count: 1, slo: 1 },
];

describe("WorkflowStageRail", () => {
  it("renders all stages with their counts and badges", () => {
    render(<WorkflowStageRail stages={stages} currentStage="approval" />);
    expect(screen.getByText("Intake")).toBeInTheDocument();
    expect(screen.getByText("Approval")).toBeInTheDocument();
    expect(screen.getByText("Posted")).toBeInTheDocument();
    expect(screen.getByText("3 cases")).toBeInTheDocument();
    expect(screen.getByText("6 cases")).toBeInTheDocument();
    expect(screen.getByText("1 case")).toBeInTheDocument();
    expect(screen.getByText("2 stuck")).toBeInTheDocument();
  });

  it("marks the current stage with aria-current=step", () => {
    render(<WorkflowStageRail stages={stages} currentStage="approval" />);
    const current = screen.getByRole("listitem", { current: "step" });
    expect(current).toHaveTextContent("Approval");
  });

  it("calls onStageClick with the stage id", async () => {
    const onStageClick = vi.fn();
    render(
      <WorkflowStageRail
        stages={stages}
        currentStage="approval"
        onStageClick={onStageClick}
      />,
    );
    await userEvent.click(screen.getByRole("listitem", { name: /Intake/ }));
    expect(onStageClick).toHaveBeenCalledWith("intake");
  });
});
