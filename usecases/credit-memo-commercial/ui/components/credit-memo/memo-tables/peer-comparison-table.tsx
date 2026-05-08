"use client";

/**
 * Peer-comparison table for Section 3 (Financial Analysis).
 *
 * Each row shows a metric, the borrower value, the peer p25/median/p75, plus
 * a 1-line assessment ("80th percentile vs RMA NAICS 333992 peer set"). When
 * p25 + p75 are present, a percentile bar visualises the borrower's position
 * inside the IQR.
 */

import * as React from "react";
import { cn } from "@/lib/ui";

export interface PeerRow {
  metric: string;
  borrower: number | string;
  median: number | string;
  p25?: number | string | null;
  p75?: number | string | null;
  borrower_assessment?: string;
}

interface Props {
  rows: PeerRow[];
  data_source?: string;
  peer_count?: number | null;
  naics_code?: string;
}

function position(
  borrower: number | string,
  p25?: number | string | null,
  p75?: number | string | null,
): number | null {
  // Compute borrower position inside [p25, p75] as a 0..1 fraction (clamped to
  // [-0.2, 1.2] so the marker shows even when outside the IQR).
  const b = typeof borrower === "number" ? borrower : parseFloat(String(borrower));
  const a = typeof p25 === "number" ? p25 : parseFloat(String(p25 ?? ""));
  const c = typeof p75 === "number" ? p75 : parseFloat(String(p75 ?? ""));
  if (![b, a, c].every(Number.isFinite) || c === a) return null;
  const pos = (b - a) / (c - a);
  return Math.max(-0.2, Math.min(1.2, pos));
}

export const PeerComparisonTable: React.FC<Props> = ({
  rows,
  data_source,
  peer_count,
  naics_code,
}) => {
  return (
    <div className="my-6 overflow-hidden rounded-md border border-rule">
      <div className="flex items-center justify-between border-b border-rule bg-paper-2 px-4 py-2">
        <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
          Peer comparison
        </p>
        <p className="text-eyebrow font-mono text-ink-3">
          {[
            naics_code && `NAICS ${naics_code}`,
            peer_count && `n=${peer_count}`,
            data_source,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-rule">
            <th
              scope="col"
              className="px-4 py-2 text-left font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3"
            >
              Metric
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3"
            >
              Borrower
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3"
            >
              P25
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3"
            >
              Median
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-right font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3"
            >
              P75
            </th>
            <th
              scope="col"
              className="px-4 py-2 text-left font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3"
            >
              Position
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pos = position(row.borrower, row.p25, row.p75);
            return (
              <tr
                key={row.metric}
                className="border-b border-rule last:border-b-0"
              >
                <th
                  scope="row"
                  className="px-4 py-2.5 text-left font-serif text-body-sm font-semi text-ink-1"
                >
                  {row.metric}
                </th>
                <td className="px-4 py-2.5 text-right font-mono text-mono tabular-nums text-ink-1 font-semi">
                  {row.borrower}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-mono-sm tabular-nums text-ink-3">
                  {row.p25 ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-mono-sm tabular-nums text-ink-2">
                  {row.median}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-mono-sm tabular-nums text-ink-3">
                  {row.p75 ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-left">
                  {pos !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 w-32 rounded-full bg-paper-2 border border-rule">
                        <span
                          aria-hidden
                          className="absolute top-1/2 h-3 w-1 -translate-y-1/2 -translate-x-1/2 rounded-sm bg-accent"
                          style={{
                            left: `${Math.min(100, Math.max(0, pos * 100))}%`,
                          }}
                        />
                        <span
                          aria-hidden
                          className="absolute top-1/2 h-1 w-px -translate-y-1/2 bg-ink-4"
                          style={{ left: "50%" }}
                        />
                      </div>
                      <span
                        className={cn(
                          "font-mono text-mono-sm whitespace-nowrap",
                          pos > 1
                            ? "text-semantic-success"
                            : pos < 0
                              ? "text-semantic-warning"
                              : "text-ink-3",
                        )}
                      >
                        {row.borrower_assessment ?? ""}
                      </span>
                    </div>
                  ) : (
                    <span className="text-ink-3 font-mono text-mono-sm">
                      {row.borrower_assessment ?? "—"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
