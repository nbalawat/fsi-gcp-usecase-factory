import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@fsi-bank/components";
import type { DecisionRow as DecisionRowData } from "../lib/data";

/**
 * One transaction row in the throughput stream.
 *
 * Design law — density 1:
 *   - exactly ONE line of height (h-7, no internal wrap)
 *   - chrome is invisible: no card, no padding-y, no shadow; one bottom
 *     hairline `border-b border-rule` per row
 *   - tabular-nums everywhere so the eye can scan vertically
 *   - the WHOLE row is the link target (CaseRow pattern, ui-standards
 *     Rule 4.5 — never make only one cell clickable)
 *
 * Server component (no interactivity) — the tick-in animation is CSS-only.
 *
 * Grid template is set via inline `style` (NOT `grid-cols-[…]`) to stay
 * inside the no-arbitrary-Tailwind-values rule.
 */
export interface DecisionRowProps {
  row: DecisionRowData;
  /** When true, this row is in the most-recent N and renders with the
   *  `tick-in` highlight on first paint. */
  isFresh?: boolean;
}

// Single source of truth for the column layout — referenced by both the
// row and the header so the columns line up byte-for-byte.
export const DECISION_GRID =
  "6.5rem minmax(0, 1fr) 4rem 5.5rem 2.5rem 4rem 8rem 5rem 3rem";

const verbBadge = (v: DecisionRowData["verb"]): "success" | "danger" | "warning" => {
  if (v === "approve") return "success";
  if (v === "decline") return "danger";
  return "warning";
};

const dollar = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const DecisionRow: React.FC<DecisionRowProps> = ({ row, isFresh = false }) => {
  return (
    <Link
      href={`/case/${row.id}`}
      style={{ gridTemplateColumns: DECISION_GRID }}
      className={[
        "grid h-7 items-center gap-3 border-b border-rule px-6 font-mono text-mono-sm tabular-nums text-ink-1 hover:bg-paper-2",
        isFresh ? "tick-in" : "",
      ].join(" ")}
    >
      <span className="text-ink-3">{row.clock}</span>
      <span className="truncate text-ink-1">{row.merchant}</span>
      <span className="text-ink-3">{row.mcc}</span>
      <span className="text-right text-ink-1">{dollar(row.amount_usd)}</span>
      <span className="text-ink-3">{row.geo}</span>
      <span className="text-right text-ink-1">{row.score}</span>
      <span className="truncate text-ink-3">{row.top_factor}</span>
      <span className="text-right text-ink-3">{row.latency_ms}ms</span>
      <span className="flex justify-end">
        <StatusBadge kind={verbBadge(row.verb)}>{row.verb}</StatusBadge>
      </span>
    </Link>
  );
};
