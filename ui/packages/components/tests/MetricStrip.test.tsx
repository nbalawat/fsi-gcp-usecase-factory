import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricStrip } from "../src/MetricStrip";

describe("MetricStrip", () => {
  it("renders all metrics with units", () => {
    render(
      <MetricStrip
        metrics={[
          { id: "dscr", label: "Avg DSCR", value: "2.41", unit: "x" },
          {
            id: "exposure",
            label: "Exposure %",
            value: "8.65",
            unit: "%",
            state: "alert",
          },
        ]}
      />,
    );
    expect(screen.getByText("Avg DSCR")).toBeInTheDocument();
    expect(screen.getByText("2.41")).toBeInTheDocument();
    expect(screen.getByText("Exposure %")).toBeInTheDocument();
    expect(screen.getByText("8.65")).toBeInTheDocument();
  });

  it("applies alert styling when state=alert", () => {
    render(
      <MetricStrip
        metrics={[
          {
            id: "exposure",
            label: "Exposure",
            value: "9",
            unit: "%",
            state: "alert",
          },
        ]}
      />,
    );
    const item = screen.getAllByRole("listitem")[0];
    expect(item.className).toMatch(/critical/);
  });
});
