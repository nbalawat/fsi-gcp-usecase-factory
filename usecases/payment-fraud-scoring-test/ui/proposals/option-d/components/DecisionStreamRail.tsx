import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import {
  clockOf,
  decisionBadge,
  type FiringEvent,
} from "../lib/data";

export interface DecisionStreamRailProps {
  events: readonly FiringEvent[];
  /** How many recent events to show. */
  limit?: number;
  /** Build the per-event drill-in href. */
  buildHref: (id: string) => string;
}

/**
 * Right-rail companion to the heatmap: a tight vertical stream of the
 * most recent firings, in decision-verb-coloured rows. Server component
 * — pure presentation, no hooks. Each row is a real <a> link so it's
 * keyboard-navigable.
 */
export const DecisionStreamRail: React.FC<DecisionStreamRailProps> = ({
  events,
  limit = 12,
  buildHref,
}) => {
  const rows = [...events]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);

  return (
    <section
      aria-label="Recent decision stream"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="border-b border-rule px-3 py-2">
        <div className="eyebrow">Live</div>
        <h3 className="font-serif text-lg font-semibold text-ink-1">
          Decision stream
        </h3>
        <p className="mt-1 font-mono text-xs text-ink-3">
          Most-recent {Math.min(rows.length, limit)} firings (read-only)
        </p>
      </header>
      <ul className="flex flex-col">
        {rows.map((e) => (
          <li
            key={e.id}
            data-decision={e.decision}
            className="border-b border-rule last:border-b-0"
          >
            <a
              href={buildHref(e.id)}
              className="flex flex-col gap-1 px-3 py-2 hover:bg-paper-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink-3 tabular-nums">
                  {clockOf(e.at)}
                </span>
                <StatusBadge kind={decisionBadge(e.decision)}>
                  {e.decision}
                </StatusBadge>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink-1 truncate min-w-0">
                  {e.merchant}
                </span>
                <span className="font-mono text-xs text-ink-1 tabular-nums">
                  ${e.amountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 font-mono text-xs text-ink-3">
                <span>
                  {e.id} · MCC {e.mcc}
                </span>
                <span>
                  score {e.score} · conf {Math.round(e.modelConfidence * 100)}%
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
};
