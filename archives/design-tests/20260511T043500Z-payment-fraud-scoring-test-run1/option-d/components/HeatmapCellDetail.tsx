"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import {
  buildFiringStream,
  clockOf,
  decisionBadge,
  labelOfFeature,
  labelOfMcc,
  type CellTally,
} from "../lib/data";

export interface HeatmapCellDetailProps {
  cell: CellTally;
  eventHref?: string;
  onClose: () => void;
}

/**
 * Drill-in panel for one heatmap cell. Lists the recent firings whose
 * (feature ∩ mcc) lit up this cell. Read-only — no scoring math, no
 * decisions changed. The "Open event" link goes to /event/[id].
 *
 * Pure presentation. The list comes from the same deterministic stream
 * the heatmap aggregator consumes.
 */
export const HeatmapCellDetail: React.FC<HeatmapCellDetailProps> = ({
  cell,
  eventHref,
  onClose,
}) => {
  const rows = React.useMemo(
    () =>
      buildFiringStream()
        .filter(
          (e) =>
            e.mcc === cell.mcc &&
            e.features.includes(cell.feature) &&
            e.decision !== "approve",
        )
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    [cell.feature, cell.mcc],
  );

  return (
    <section
      aria-label={`Cell detail ${labelOfFeature(cell.feature)} × ${labelOfMcc(cell.mcc)}`}
      className="border-t border-rule bg-paper-2"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
        <div>
          <div className="eyebrow">Cell drill-in</div>
          <h3 className="font-serif text-lg font-semibold text-ink-1">
            {labelOfFeature(cell.feature)}{" "}
            <span className="text-ink-3">×</span>{" "}
            {labelOfMcc(cell.mcc)}{" "}
            <span className="font-mono text-sm text-ink-3">({cell.mcc})</span>
          </h3>
          <div className="mt-1 flex flex-wrap gap-3 font-mono text-xs text-ink-3">
            <span>{cell.count} non-approve firing(s)</span>
            <span>{cell.declines} decline · {cell.stepUps} step-up</span>
            {cell.lastAt && (
              <span>last fired {clockOf(cell.lastAt)} UTC</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-rule px-2 py-1 font-mono text-xs text-ink-2 hover:bg-paper"
          aria-label="Close cell detail"
        >
          close ×
        </button>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-xs text-ink-3">
          No firings recorded for this cell.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0"
            >
              <span className="font-mono text-xs text-ink-3 tabular-nums w-16">
                {clockOf(e.at)}
              </span>
              <span className="font-mono text-xs text-ink-2 w-20">
                {e.id}
              </span>
              <span className="font-mono text-xs text-ink-1 tabular-nums w-24 text-right">
                ${e.amountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-sm text-ink-1 truncate flex-1 min-w-0">
                {e.merchant}
              </span>
              <span className="font-mono text-xs text-ink-3">
                score {e.score}
              </span>
              <StatusBadge kind={decisionBadge(e.decision)}>
                {e.decision}
              </StatusBadge>
              <a
                href={eventHref && e.id === cell.lastEventId ? eventHref : `/event/${e.id}`}
                className="font-mono text-xs text-accent-pressed hover:underline"
              >
                Open →
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
