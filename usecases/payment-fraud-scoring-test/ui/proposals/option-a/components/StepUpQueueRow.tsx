import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@fsi-bank/components";
import type { StepUpRow as StepUpRowData } from "../lib/data";

/**
 * One row in the step-up disposition queue (the /approval route).
 *
 * Real-time fraud has NO HITL gates — the score is advisory and the
 * decline / approve / step-up call is automated. The ONE place a human
 * touches the case is here: reviewing a step-up challenge the customer
 * responded to. The row is read-only; the action is to drill into the
 * transaction for audit.
 *
 * Same density-1 conventions as the decision row: one line, hairline
 * border, tabular-nums, whole row is a link.
 *
 * Grid template is set via inline `style` (NOT `grid-cols-[…]`) so the
 * no-arbitrary-Tailwind-values rule is preserved.
 */
export interface StepUpQueueRowProps {
  row: StepUpRowData;
}

export const STEPUP_GRID =
  "6.5rem minmax(0, 1fr) 5.5rem 5rem 4.5rem 6.5rem 5rem";

const dollar = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusBadge = (
  s: StepUpRowData["status"],
): "success" | "danger" | "warning" | "neutral" => {
  if (s === "passed") return "success";
  if (s === "failed") return "danger";
  if (s === "expired") return "neutral";
  return "warning";
};

export const StepUpQueueRow: React.FC<StepUpQueueRowProps> = ({ row }) => {
  // The decision id is encoded in the challenge id ({txId}-CHL).
  const txId = row.id.replace(/-CHL$/, "");
  return (
    <Link
      href={`/case/${txId}`}
      style={{ gridTemplateColumns: STEPUP_GRID }}
      className="grid h-7 items-center gap-3 border-b border-rule px-6 font-mono text-mono-sm tabular-nums text-ink-1 hover:bg-paper-2"
    >
      <span className="text-ink-3">{row.clock}</span>
      <span className="truncate text-ink-1">{row.merchant}</span>
      <span className="text-right text-ink-1">{dollar(row.amount_usd)}</span>
      <span className="text-ink-3">{row.channel}</span>
      <span className="text-right text-ink-3">
        {row.response_secs === undefined ? "—" : `${row.response_secs}s`}
      </span>
      <span className="truncate text-ink-3">{row.id}</span>
      <span className="flex justify-end">
        <StatusBadge kind={statusBadge(row.status)}>{row.status}</StatusBadge>
      </span>
    </Link>
  );
};
