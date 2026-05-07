import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RegulatoryClock } from "../src/RegulatoryClock";

describe("RegulatoryClock", () => {
  it("renders an OK band when plenty of time remains", () => {
    render(
      <RegulatoryClock
        regulatoryRegime="OCC 5-business-day"
        startedAt="2026-04-25T08:00:00Z"
        deadline="2026-04-30T17:00:00Z"
        now={new Date("2026-04-26T12:00:00Z")}
      />,
    );
    const region = screen.getByLabelText("OCC 5-business-day clock");
    expect(region).toHaveAttribute("data-band", "ok");
  });

  it("turns critical when within 8 hours", () => {
    render(
      <RegulatoryClock
        regulatoryRegime="OCC 5-business-day"
        startedAt="2026-04-22T14:15:00Z"
        deadline="2026-04-26T18:00:00Z"
        now={new Date("2026-04-26T12:00:00Z")}
      />,
    );
    const region = screen.getByLabelText("OCC 5-business-day clock");
    expect(region).toHaveAttribute("data-band", "critical");
  });

  it("renders a breach state when past the deadline", () => {
    render(
      <RegulatoryClock
        regulatoryRegime="OCC 5-business-day"
        startedAt="2026-04-22T14:15:00Z"
        deadline="2026-04-25T17:00:00Z"
        now={new Date("2026-04-26T12:00:00Z")}
      />,
    );
    const region = screen.getByLabelText("OCC 5-business-day clock");
    expect(region).toHaveAttribute("data-band", "breach");
    expect(
      screen.getByText(/Deadline breached/),
    ).toBeInTheDocument();
  });
});
