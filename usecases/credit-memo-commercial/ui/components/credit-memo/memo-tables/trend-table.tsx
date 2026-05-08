"use client";

/**
 * Three-year trend table — the centerpiece of Section 3 (Financial Analysis).
 *
 * Banker conventions:
 *   - left column: metric name in semi-bold serif
 *   - right columns: period values in mono tabular-nums, right-aligned
 *   - rightmost column: trend annotation ("+8.8% 2yr CAGR") in mono small
 *   - hairline rules between rows; no zebra
 *   - 32px row height
 */

import * as React from "react";
import { cn } from "@/lib/ui";

export interface TrendRow {
  metric: string;
  values: Array<number | string | null>;
  trend?: string;
}

interface Props {
  periods: string[];
  rows: TrendRow[];
  /**
   * If a value is a number, format it with this fn (default: native toLocale
   * with no decimals). Pass a custom one when each row has a different unit.
   */
  formatValue?: (value: number, rowIndex: number) => string;
  caption?: string;
}

const defaultFormat = (n: number): string =>
  Math.abs(n) >= 1000
    ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export const TrendTable: React.FC<Props> = ({
  periods,
  rows,
  formatValue = (v) => defaultFormat(v),
  caption,
}) => {
  return (
    <div className="my-6 overflow-hidden rounded-md border border-rule">
      {caption && (
        <p className="border-b border-rule bg-paper-2 px-4 py-2 text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
          {caption}
        </p>
      )}
      <table className="w-full text-mono">
        <thead>
          <tr className="border-b border-rule">
            <th
              className="px-4 py-2 text-left font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3"
              scope="col"
            >
              Metric
            </th>
            {periods.map((p) => (
              <th
                key={p}
                scope="col"
                className="px-4 py-2 text-right font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3"
              >
                {p}
              </th>
            ))}
            <th
              scope="col"
              className="px-4 py-2 text-right font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3"
            >
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={row.metric}
              className={cn("border-b border-rule last:border-b-0")}
            >
              <th
                scope="row"
                className="px-4 py-2 text-left font-serif text-body-sm font-semi text-ink-1"
              >
                {row.metric}
              </th>
              {row.values.map((v, vi) => {
                let display: string;
                if (v === null || v === undefined) display = "—";
                else if (typeof v === "number") display = formatValue(v, ri);
                else display = String(v);
                return (
                  <td
                    key={`${row.metric}-${vi}`}
                    className="px-4 py-2 text-right font-mono text-mono tabular-nums text-ink-1"
                  >
                    {display}
                  </td>
                );
              })}
              <td className="px-4 py-2 text-right font-mono text-mono-sm tabular-nums text-ink-2">
                {row.trend ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
