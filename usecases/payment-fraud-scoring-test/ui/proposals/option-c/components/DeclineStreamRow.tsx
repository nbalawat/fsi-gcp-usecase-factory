"use client";

import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@fsi-bank/components";
import { DeclineReasonActions } from "./DeclineReasonActions";
import {
  DECLINE_REASONS,
  type DeclineRow,
  type DeclineReason,
  type TuneActionKind,
} from "../lib/data";

function clockOf(iso: string): string {
  return iso.substring(11, 19);
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function dispositionKind(
  d: DeclineRow["disposition"],
): "danger" | "warning" | "success" {
  if (d === "decline") return "danger";
  if (d === "step-up") return "warning";
  return "success";
}

export interface DeclineStreamRowProps {
  row: DeclineRow;
  /** Disposed actions for this row by reason id */
  disposed: Partial<Record<string, TuneActionKind>>;
  /** Called when an inline action is clicked. */
  onAction: (reason: DeclineReason, kind: TuneActionKind, rowId: string) => void;
  /** Where the "open detail" link should route to. */
  detailHref: string;
}

/**
 * One row in the bulk decline-stream tuning surface. Each row carries:
 *
 *   1. The transaction tombstone (clock · customer · merchant · amount · score).
 *   2. ONE inline `DeclineReasonActions` per decline reason — affordance
 *      lives next to the reason, not in a separate panel.
 *   3. A "view detail" link to the per-transaction page.
 *
 * Every interactive element is a real button or anchor with onClick / href.
 */
export const DeclineStreamRow: React.FC<DeclineStreamRowProps> = ({
  row,
  disposed,
  onAction,
  detailHref,
}) => {
  return (
    <li
      data-row-id={row.id}
      data-disposition={row.disposition}
      className="flex flex-col gap-3 border-b border-rule px-4 py-3 last:border-b-0"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-mono-sm tabular-nums text-ink-3">
            {clockOf(row.at)}
          </span>
          <span className="font-serif text-base font-semibold text-ink-1">
            {fmtUsd(row.amountUsd)} · {row.merchant}
          </span>
          <span className="font-mono text-mono-sm text-ink-3">
            {row.customer} · {row.corridor}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-mono-sm tabular-nums text-ink-2">
            score {row.score.toFixed(2)}
          </span>
          <StatusBadge kind={dispositionKind(row.disposition)}>
            {row.disposition}
          </StatusBadge>
          <Link
            href={detailHref}
            className="rounded-sm border border-rule px-2 py-0.5 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
          >
            detail →
          </Link>
        </div>
      </header>
      <div className="flex flex-col gap-2 pl-0 md:pl-6">
        {row.reasonIds.map((rid) => {
          const reason = DECLINE_REASONS[rid];
          return (
            <DeclineReasonActions
              key={rid}
              reason={reason}
              disposed={disposed[rid]}
              compact
              onAction={(kind) => onAction(reason, kind, row.id)}
            />
          );
        })}
      </div>
    </li>
  );
};
