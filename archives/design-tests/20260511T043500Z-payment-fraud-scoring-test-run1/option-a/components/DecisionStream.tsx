"use client";

import * as React from "react";
import { DecisionRow, DECISION_GRID } from "./DecisionRow";
import type { DecisionRow as DecisionRowData, DecisionVerb } from "../lib/data";

/**
 * The throughput stream — the page IS this list.
 *
 * Density-1 conventions:
 *   - one-line rows
 *   - 9-column fixed-width grid (clock · merchant · mcc · amount · geo ·
 *     score · top-factor · latency · verb)
 *   - filter chips above the list (approve / decline / step-up / all)
 *   - the header row is a sibling that shares the same grid template
 *
 * Client component because the verb-filter chips toggle visible rows.
 * Filtering is a pure read — no business mutation.
 */
export interface DecisionStreamProps {
  rows: readonly DecisionRowData[];
  /** Total approved / declined / step-up counts for the chip badges. */
  counts: { all: number; approve: number; decline: number; stepUp: number };
}

type Filter = "all" | DecisionVerb;

const CHIPS: { id: Filter; label: string }[] = [
  { id: "all",      label: "all" },
  { id: "approve",  label: "approve" },
  { id: "decline",  label: "decline" },
  { id: "step-up",  label: "step-up" },
];

export const DecisionStream: React.FC<DecisionStreamProps> = ({ rows, counts }) => {
  const [filter, setFilter] = React.useState<Filter>("all");
  const visible = React.useMemo(
    () => (filter === "all" ? [...rows] : rows.filter((r) => r.verb === filter)),
    [rows, filter],
  );
  // Mark the most-recent 4 rows as "fresh" so they animate in.
  const freshCutoff = visible.length - 4;

  return (
    <section aria-label="Live decision stream" className="bg-paper">
      <header className="flex items-center justify-between border-b border-rule bg-paper-2 px-6 py-2 font-mono text-mono-sm text-ink-3">
        <div className="flex items-center gap-2">
          <span className="eyebrow">live decisions</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-3 tabular-nums">
            {visible.length} of {counts.all} rows
          </span>
        </div>
        <div role="tablist" aria-label="Filter by decision verb" className="flex items-center gap-1">
          {CHIPS.map((c) => {
            const active = filter === c.id;
            const count =
              c.id === "all"      ? counts.all     :
              c.id === "approve"  ? counts.approve :
              c.id === "decline"  ? counts.decline :
                                    counts.stepUp;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(c.id)}
                className={[
                  "rounded-sm px-2 py-0.5 text-mono-sm tabular-nums",
                  active
                    ? "bg-ink-1 text-paper"
                    : "bg-paper text-ink-2 hover:bg-paper-3",
                ].join(" ")}
              >
                {c.label} <span className="text-ink-4">{count}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Column header — same grid template as DecisionRow */}
      <div
        role="row"
        aria-label="Column headers"
        style={{ gridTemplateColumns: DECISION_GRID }}
        className="grid h-6 items-center gap-3 border-b border-rule bg-paper-2 px-6 font-mono text-mono-sm uppercase tracking-wide text-ink-3"
      >
        <span>clock</span>
        <span>merchant</span>
        <span>mcc</span>
        <span className="text-right">amount</span>
        <span>geo</span>
        <span className="text-right">score</span>
        <span>top factor</span>
        <span className="text-right">latency</span>
        <span className="text-right">verb</span>
      </div>

      <ol className="flex flex-col">
        {visible.map((r, i) => (
          <li key={r.id}>
            <DecisionRow row={r} isFresh={i >= freshCutoff} />
          </li>
        ))}
      </ol>

      {visible.length === 0 && (
        <p className="px-6 py-4 font-mono text-mono-sm text-ink-3">
          No transactions match this filter in the current window.
        </p>
      )}
    </section>
  );
};
