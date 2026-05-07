import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalGate } from "../src/ApprovalGate";

const baseRec = {
  decision: "APPROVE",
  riskBand: "1-pass",
  rationaleSummary: "Strong financials.",
  approvalAuthority: "senior-credit-committee",
  irrevocable: true,
};

describe("ApprovalGate", () => {
  it("renders the recommendation summary and authority", () => {
    render(
      <ApprovalGate
        caseId="DEMO-APP-MFG-001-2026"
        recommendation={baseRec}
        onAccept={vi.fn()}
        onEdit={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.getByText(/APPROVE/)).toBeInTheDocument();
    expect(screen.getByText(/Strong financials/)).toBeInTheDocument();
    expect(
      screen.getByText(/senior-credit-committee/),
    ).toBeInTheDocument();
  });

  it("requires confirmation for irrevocable accept and then fires onAccept", async () => {
    const onAccept = vi.fn();
    render(
      <ApprovalGate
        caseId="X"
        recommendation={baseRec}
        onAccept={onAccept}
        onEdit={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(onAccept).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^Confirm$/ }));
    expect(onAccept).toHaveBeenCalledWith("X");
  });

  it("disables return / reject until a comment is entered", async () => {
    const onEdit = vi.fn();
    render(
      <ApprovalGate
        caseId="X"
        recommendation={{ ...baseRec, irrevocable: false }}
        onAccept={vi.fn()}
        onEdit={onEdit}
        onReject={vi.fn()}
      />,
    );
    const returnBtn = screen.getByRole("button", {
      name: /Return for revision/,
    });
    expect(returnBtn).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText(/Reason for return/),
      "Restructure covenant",
    );
    expect(returnBtn).toBeEnabled();
    await userEvent.click(returnBtn);
    await userEvent.click(screen.getByRole("button", { name: /^Confirm$/ }));
    expect(onEdit).toHaveBeenCalledWith("X", "Restructure covenant");
  });
});
