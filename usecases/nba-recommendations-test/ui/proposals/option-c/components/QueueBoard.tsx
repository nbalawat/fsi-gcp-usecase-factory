"use client";

import * as React from "react";
import { InlineDispositionRow } from "./InlineDispositionRow";
import { QueueFilterTabs } from "./QueueFilterTabs";
import type { QueueFilter, RecommendationRow } from "../lib/data";

export interface QueueBoardProps {
  rows: readonly RecommendationRow[];
}

/**
 * Client-side queue host: owns the filter tab state, then renders
 * one InlineDispositionRow per recommendation. The disposition state
 * stays on each row — no global state — because option-C's discipline
 * is "the queue IS the action surface" (no bottom bar, no modal).
 */
export const QueueBoard: React.FC<QueueBoardProps> = ({ rows }) => {
  const [filter, setFilter] = React.useState<QueueFilter>("pending");

  const counts: Record<QueueFilter, number> = {
    all: rows.length,
    pending: rows.filter((r) => r.disposition === "pending").length,
    "high-uplift": rows.filter((r) => r.uplift_score >= 85).length,
    review: rows.filter((r) => r.regulatory_clear === "review").length,
  };

  const visible =
    filter === "all"
      ? rows
      : filter === "pending"
        ? rows.filter((r) => r.disposition === "pending")
        : filter === "high-uplift"
          ? rows.filter((r) => r.uplift_score >= 85)
          : rows.filter((r) => r.regulatory_clear === "review");

  return (
    <>
      <QueueFilterTabs active={filter} counts={counts} onChange={setFilter} />
      <div className="grid grid-cols-1 gap-3 px-6 py-5">
        {visible.length === 0 && (
          <div className="rounded-md border border-rule bg-paper-2 p-6 text-center text-body-sm text-ink-2">
            No recommendations in this view.
          </div>
        )}
        {visible.map((r) => (
          <InlineDispositionRow
            key={r.id}
            rec={r}
            approvalHref={`/approval/${encodeURIComponent(r.id)}`}
            detailHref={`/case/${encodeURIComponent(r.id)}`}
          />
        ))}
      </div>
    </>
  );
};
