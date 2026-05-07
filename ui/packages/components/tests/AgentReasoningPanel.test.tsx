import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentReasoningPanel } from "../src/AgentReasoningPanel";

describe("AgentReasoningPanel", () => {
  it("renders factors with sources and confidence", () => {
    render(
      <AgentReasoningPanel
        step="rater"
        confidence={0.92}
        citationDensity={0.88}
        rationale="risk band 1-pass"
        factors={[
          {
            name: "DSCR base",
            weight: 0.3,
            evidence: "3.82x",
            source: "svc-dscr-calculator",
            band: "ok",
          },
          {
            name: "Exposure",
            weight: 0.3,
            evidence: "1.3% of Tier 1",
            source: "svc-exposure-aggregator",
            band: "ok",
          },
        ]}
      />,
    );
    expect(screen.getByText(/Agent reasoning/)).toBeInTheDocument();
    expect(screen.getByText("DSCR base")).toBeInTheDocument();
    expect(screen.getByText("Exposure")).toBeInTheDocument();
    expect(screen.getByText("source: svc-dscr-calculator")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  it("flags low citation density visually", () => {
    render(
      <AgentReasoningPanel
        confidence={0.9}
        citationDensity={0.5}
        factors={[]}
      />,
    );
    const cd = screen.getByText("50%");
    expect(cd.className).toMatch(/critical/);
  });
});
