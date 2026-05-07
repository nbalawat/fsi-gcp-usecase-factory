import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BreadcrumbNav } from "../src/BreadcrumbNav";

describe("BreadcrumbNav", () => {
  it("renders the use case label and caseId", () => {
    render(
      <BreadcrumbNav
        usecase="credit-memo-commercial"
        usecaseLabel="Credit Memo (Commercial)"
        stage="approval"
        borrowerName="Acme Manufacturing"
        caseId="DEMO-APP-MFG-001-2026"
      />,
    );
    expect(screen.getByText("Credit Memo (Commercial)")).toBeInTheDocument();
    expect(screen.getByText("approval")).toBeInTheDocument();
    expect(screen.getByText("Acme Manufacturing")).toBeInTheDocument();
    expect(screen.getByText("DEMO-APP-MFG-001-2026")).toBeInTheDocument();
  });

  it("renders the back link", () => {
    render(
      <BreadcrumbNav
        usecase="credit-memo-commercial"
        backHref="/floor"
        backLabel="Live floor"
      />,
    );
    const back = screen.getByRole("link", { name: /Live floor/ });
    expect(back).toHaveAttribute("href", "/floor");
  });
});
