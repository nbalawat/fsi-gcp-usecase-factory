"use client";

import * as React from "react";
import { QueueFilterBar, type QueueFilter } from "./QueueFilterBar";
import { RecRow } from "./RecRow";
import { expiryUrgency, type Recommendation } from "../lib/data";

export interface QueueTableProps {
  recs: readonly Recommendation[];
}

/**
 * The queue IS the page. A dense list of recommendation rows; each
 * row is a complete unit. The filter bar lets the RM scrub by
 * disposition. There is no pagination — the seed targets 50-200
 * rows/day; the dense layout keeps the whole queue on one viewport
 * with scrolling.
 *
 * Client component because the filter is interactive and the per-row
 * disposition buttons mutate local state.
 */
export const QueueTable: React.FC<QueueTableProps> = ({ recs }) => {
  const [filter, setFilter] = React.useState<QueueFilter>("pending");

  const counts = React.useMemo<Partial<Record<QueueFilter, number>>>(() => {
    const acc: Partial<Record<QueueFilter, number>> = {
      all: recs.length,
      pending: 0,
      accepted: 0,
      dismissed: 0,
      snoozed: 0,
      sent: 0,
      expiring: 0,
    };
    for (const r of recs) {
      acc[r.disposition] = (acc[r.disposition] ?? 0) + 1;
      if (r.disposition === "pending" && expiryUrgency(r.expiresAt) !== "ok") {
        acc.expiring = (acc.expiring ?? 0) + 1;
      }
    }
    return acc;
  }, [recs]);

  const filtered = React.useMemo<Recommendation[]>(() => {
    if (filter === "all") return [...recs];
    if (filter === "expiring") {
      return recs.filter(
        (r) =>
          r.disposition === "pending" && expiryUrgency(r.expiresAt) !== "ok",
      );
    }
    return recs.filter((r) => r.disposition === filter);
  }, [recs, filter]);

  return (
    <section
      aria-label="Recommendation queue"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <div>
          <div className="eyebrow">Today's queue</div>
          <h2 className="font-serif text-h3 font-semi text-ink-1">
            Next-best-action recommendations
          </h2>
        </div>
        <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
          {filtered.length} of {recs.length} shown
        </span>
      </header>
      <QueueFilterBar
        active={filter}
        counts={counts}
        onChange={setFilter}
      />

      {/* Column header — anchors the dense grid. */}
      <div
        role="row"
        className="grid grid-cols-[16rem_1fr_5rem_5rem_5rem_auto] items-center gap-3 border-b border-rule bg-paper-2 px-3 py-2 font-mono text-mono-sm text-ink-3"
      >
        <span>Customer</span>
        <span>Recommended action · rationale</span>
        <span className="text-right">Conf.</span>
        <span className="text-right">Uplift</span>
        <span className="text-right">Expires</span>
        <span className="text-right">Status · disposition</span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-12 text-center font-mono text-mono-sm text-ink-3">
          No recommendations match this filter.
        </div>
      ) : (
        <ol className="flex flex-col">
          {filtered.map((r) => (
            <RecRow key={r.id} rec={r} />
          ))}
        </ol>
      )}
    </section>
  );
};
