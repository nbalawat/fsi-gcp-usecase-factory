"use client";

/**
 * Scenario matrix for Section 4 (Cash Flow Projection).
 *
 * Columns are scenarios (base, downside, recession, recession+200bps); rows
 * are the year-3 line items. Covenant headroom is colored: positive = green,
 * narrow (<5%) = amber, breach (<0) = red.
 */

import * as React from "react";
import { cn } from "@/lib/ui";
import {
  fmtPctValue,
  fmtRatioX,
  fmtUsdCompact,
} from "../format";
import type { CashFlowProjection } from "../types";

interface Props {
  scenarios: CashFlowProjection["scenarios"];
}

const headroomTone = (pct: number): string => {
  if (pct < 0) return "text-semantic-danger font-semi";
  if (pct < 5) return "text-semantic-warning font-semi";
  return "text-semantic-success";
};

const dscrTone = (dscr: number): string => {
  if (dscr < 1.0) return "text-semantic-danger font-semi";
  if (dscr < 1.25) return "text-semantic-warning font-semi";
  return "text-foreground";
};

const labelFor = (s: CashFlowProjection["scenarios"][number]): string =>
  s.label ??
  ({
    base: "Base",
    downside: "Downside",
    recession: "Recession",
    recession_plus_200bps: "Recession + 200 bps",
    rate_shock_only: "Rate shock",
    custom: "Custom",
  } as const)[s.name];

export const ScenarioMatrix: React.FC<Props> = ({ scenarios }) => {
  return (
    <div className="my-6 overflow-x-auto rounded-md border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="px-4 py-2 text-left font-mono text-mono-sm uppercase tracking-[0.04em] text-muted-foreground"
            >
              Year-3 line item
            </th>
            {scenarios.map((s) => (
              <th
                key={s.name}
                scope="col"
                className="px-4 py-2 text-right font-mono text-mono-sm uppercase tracking-[0.04em] text-muted-foreground"
              >
                {labelFor(s)}
              </th>
            ))}
          </tr>
          <tr className="border-b border-border bg-muted">
            <th
              scope="row"
              className="px-4 py-2 text-left font-mono text-mono-sm text-muted-foreground"
            >
              Revenue CAGR / EBITDA / rate shock
            </th>
            {scenarios.map((s) => (
              <td
                key={`${s.name}-assumptions`}
                className="px-4 py-2 text-right font-mono text-mono-sm tabular-nums text-muted-foreground"
              >
                {fmtPctValue(s.revenue_cagr * 100, 1)} ·{" "}
                {fmtPctValue(s.ebitda_margin * 100, 1)} ·{" "}
                {s.rate_shock_bps > 0 ? `+${s.rate_shock_bps}bps` : `${s.rate_shock_bps}bps`}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          <Row
            label="Revenue (year 3)"
            scenarios={scenarios}
            value={(s) => fmtUsdCompact(s.year_3.revenue_usd)}
          />
          <Row
            label="EBITDA (year 3)"
            scenarios={scenarios}
            value={(s) => fmtUsdCompact(s.year_3.ebitda_usd)}
          />
          <Row
            label="Annual debt service"
            scenarios={scenarios}
            value={(s) => fmtUsdCompact(s.year_3.annual_debt_service_usd)}
          />
          <Row
            label="DSCR"
            scenarios={scenarios}
            value={(s) => fmtRatioX(s.year_3.dscr)}
            tone={(s) => dscrTone(s.year_3.dscr)}
          />
          <Row
            label="Leverage (Debt / EBITDA)"
            scenarios={scenarios}
            value={(s) => fmtRatioX(s.year_3.leverage)}
          />
          <Row
            label="Covenant headroom (DSCR)"
            scenarios={scenarios}
            value={(s) =>
              fmtPctValue(s.year_3.covenant_headroom_dscr_pct, 1)
            }
            tone={(s) => headroomTone(s.year_3.covenant_headroom_dscr_pct)}
          />
        </tbody>
      </table>
    </div>
  );
};

const Row: React.FC<{
  label: string;
  scenarios: CashFlowProjection["scenarios"];
  value: (s: CashFlowProjection["scenarios"][number]) => string;
  tone?: (s: CashFlowProjection["scenarios"][number]) => string;
}> = ({ label, scenarios, value, tone }) => (
  <tr className="border-b border-border last:border-b-0">
    <th
      scope="row"
      className="px-4 py-2.5 text-left font-serif text-body-sm font-semi text-foreground"
    >
      {label}
    </th>
    {scenarios.map((s) => (
      <td
        key={`${s.name}-${label}`}
        className={cn(
          "px-4 py-2.5 text-right font-mono text-mono tabular-nums",
          tone ? tone(s) : "text-foreground",
        )}
      >
        {value(s)}
      </td>
    ))}
  </tr>
);
