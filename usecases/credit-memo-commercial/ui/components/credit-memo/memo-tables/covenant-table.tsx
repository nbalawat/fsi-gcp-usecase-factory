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
  if (pct === undefined) return "text-muted-foreground";
  if (pct < 0) return "text-semantic-danger font-semi";
  if (pct < 10) return "text-semantic-warning font-semi";
  return "text-semantic-success";
};

const fmtThreshold = (
  threshold: number | null | undefined,
  unit: string | undefined,
): string => {
  if (threshold === null || threshold === undefined || !Number.isFinite(threshold)) {
    return "—";
  }
  if (unit === "x") return `${threshold.toFixed(2)}x`;
  if (unit === "pct") return fmtPctValue(threshold * 100, 1);
  if (unit === "usd") return fmtUsdCompact(threshold);
  return threshold.toString();
};

export const CovenantTable: React.FC<Props> = ({ covenants: covenantsRaw }) => {
  const covenants = covenantsRaw ?? [];
  return (
    <div className="my-6 overflow-hidden rounded-md border border-border">
      <p className="border-b border-border bg-muted px-4 py-2 text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
        Maintenance covenants
      </p>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col />
            <col className="w-[88px]" />
            <col className="w-[96px]" />
            <col className="w-[72px]" />
            <col className="w-[112px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              <Th>Covenant</Th>
              <Th align="right">Threshold</Th>
              <Th align="right">Test</Th>
              <Th align="right">Grace</Th>
              <Th align="right">Headroom</Th>
            </tr>
          </thead>
          <tbody>
            {covenants.map((c) => (
              <tr
                key={c.name}
                className="border-b border-border last:border-b-0 align-top"
              >
                <th
                  scope="row"
                  className="px-4 py-2.5 text-left font-serif text-body-sm font-semi text-foreground"
                >
                  <span className="block">{titleCase(c.name)}</span>
                  {c.rationale ? (
                    <span className="mt-0.5 block text-body-sm font-normal text-foreground/70">
                      {c.rationale}
                    </span>
                  ) : null}
                </th>
                <td className="px-3 py-2.5 text-right font-mono text-mono-sm tabular-nums text-foreground">
                  {fmtThreshold(c.threshold, c.threshold_unit)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-mono-sm tabular-nums text-foreground/85">
                  {titleCase(c.test_frequency)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-mono-sm tabular-nums text-muted-foreground">
                  {c.grace_period_days != null ? `${c.grace_period_days}d` : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-mono text-mono-sm tabular-nums",
                    headroomTone(c.headroom_pct_at_base),
                  )}
                >
                  {c.headroom_pct_at_base != null
                    ? fmtPctValue(c.headroom_pct_at_base, 1)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      "py-2 font-mono text-mono-sm uppercase tracking-[0.04em] text-muted-foreground whitespace-nowrap",
      align === "right" ? "px-3 text-right" : "px-4 text-left",
    )}
  >
    {children}
  </th>
);
