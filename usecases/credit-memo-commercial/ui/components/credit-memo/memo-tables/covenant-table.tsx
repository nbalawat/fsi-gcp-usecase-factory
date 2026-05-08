"use client";

/**
 * Covenant package table (Section 7).
 *
 * Renders the maintenance covenants — name, threshold, test frequency, grace
 * period, headroom-at-base. The headroom column gets the same red/amber/green
 * tone as the scenario matrix.
 */

import * as React from "react";
import { cn } from "@/lib/ui";
import { fmtPctValue, fmtUsdCompact, titleCase } from "../format";
import type { CovenantPackage } from "../types";

interface Props {
  covenants: CovenantPackage["maintenance_covenants"];
}

const headroomTone = (pct: number | undefined): string => {
  if (pct === undefined) return "text-ink-3";
  if (pct < 0) return "text-semantic-danger font-semi";
  if (pct < 10) return "text-semantic-warning font-semi";
  return "text-semantic-success";
};

const fmtThreshold = (
  threshold: number,
  unit: string | undefined,
): string => {
  if (unit === "x") return `${threshold.toFixed(2)}x`;
  if (unit === "pct") return fmtPctValue(threshold * 100, 1);
  if (unit === "usd") return fmtUsdCompact(threshold);
  return threshold.toString();
};

export const CovenantTable: React.FC<Props> = ({ covenants: covenantsRaw }) => {
  const covenants = covenantsRaw ?? [];
  return (
    <div className="my-6 overflow-hidden rounded-md border border-rule">
      <p className="border-b border-rule bg-paper-2 px-4 py-2 text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
        Maintenance covenants
      </p>
      <table className="w-full">
        <thead>
          <tr className="border-b border-rule">
            <Th>Covenant</Th>
            <Th align="right">Threshold</Th>
            <Th align="right">Test</Th>
            <Th align="right">Grace</Th>
            <Th align="right">Headroom @ base</Th>
            <Th>Rationale</Th>
          </tr>
        </thead>
        <tbody>
          {covenants.map((c) => (
            <tr
              key={c.name}
              className="border-b border-rule last:border-b-0 align-top"
            >
              <th
                scope="row"
                className="px-4 py-2.5 text-left font-serif text-body-sm font-semi text-ink-1 whitespace-nowrap"
              >
                {titleCase(c.name)}
              </th>
              <td className="px-4 py-2.5 text-right font-mono text-mono tabular-nums text-ink-1">
                {fmtThreshold(c.threshold, c.threshold_unit)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-mono-sm tabular-nums text-ink-2">
                {titleCase(c.test_frequency)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-mono-sm tabular-nums text-ink-3">
                {c.grace_period_days != null ? `${c.grace_period_days}d` : "—"}
              </td>
              <td
                className={cn(
                  "px-4 py-2.5 text-right font-mono text-mono tabular-nums",
                  headroomTone(c.headroom_pct_at_base),
                )}
              >
                {c.headroom_pct_at_base != null
                  ? fmtPctValue(c.headroom_pct_at_base, 1)
                  : "—"}
              </td>
              <td className="px-4 py-2.5 text-left font-serif text-body-sm text-ink-2 max-w-[280px]">
                {c.rationale ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Th: React.FC<{
  children: React.ReactNode;
  align?: "left" | "right";
}> = ({ children, align = "left" }) => (
  <th
    scope="col"
    className={cn(
      "px-4 py-2 font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3",
      align === "right" ? "text-right" : "text-left",
    )}
  >
    {children}
  </th>
);
