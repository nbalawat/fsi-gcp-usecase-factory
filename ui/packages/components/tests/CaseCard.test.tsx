import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaseCard } from "../src/CaseCard";

describe("CaseCard", () => {
  it("renders borrower, amount, and DSCR (happy path)", () => {
    render(
      <CaseCard
        id="DEMO-APP-MFG-001-2026"
        borrowerId="DEMO-MFG-001"
        borrowerName="Acme Manufacturing"
        stage="approval"
        riskBand="1-pass"
        dscr={3.82}
        loanAmountUsd={8_000_000}
        conf={0.94}
      />,
    );
    expect(screen.getByText("Acme Manufacturing")).toBeInTheDocument();
    expect(screen.getByText("DEMO-APP-MFG-001-2026")).toBeInTheDocument();
    expect(screen.getByText("$8,000,000")).toBeInTheDocument();
    expect(screen.getByText("3.82x")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
    expect(screen.getByText("1-pass")).toBeInTheDocument();
  });

  it("shows stuck indicator when stuck=true", () => {
    render(
      <CaseCard
        id="x"
        borrowerId="x"
        stage="spreading"
        stuck
        alert="Doc IQ timeout"
      />,
    );
    expect(screen.getByTestId("case-card-x")).toHaveAttribute(
      "data-stuck",
      "true",
    );
    expect(screen.getByText(/Stuck/)).toBeInTheDocument();
    expect(screen.getByText("Doc IQ timeout")).toBeInTheDocument();
  });

  it("calls onClick", async () => {
    const onClick = vi.fn();
    render(
      <CaseCard
        id="x"
        borrowerId="x"
        stage="approval"
        onClick={onClick}
      />,
    );
    await userEvent.click(screen.getByTestId("case-card-x"));
    expect(onClick).toHaveBeenCalled();
  });
});
