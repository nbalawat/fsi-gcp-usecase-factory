"use client";

import * as React from "react";
import type { RecDisposition } from "../lib/data";

export type QueueFilter = "all" | RecDisposition | "expiring";

export interface QueueFilterBarProps {
  active: QueueFilter;
  counts: Partial<Record<QueueFilter, number>>;
  onChange: (next: QueueFilter) => void;
}

const TABS: ReadonlyArray<{ id: QueueFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "expiring", label: "Expiring < 48h" },
  { id: "accepted", label: "Accepted" },
  { id: "snoozed", label: "Snoozed" },
  { id: "dismissed", label: "Dismissed" },
  { id: "sent", label: "Sent" },
];

/**
 * Filter tabs for the queue. Default is "Pending" — that's the work
 * the RM came here to do. "Expiring < 48h" is a secondary critical
 * view that surfaces high-urgency rows regardless of disposition.
 */
export const QueueFilterBar: React.FC<QueueFilterBarProps> = ({
  active,
  counts,
  onChange,
}) => {
  return (
    <div
      role="tablist"
      aria-label="Filter queue by disposition"
      className="flex items-center gap-1 border-b border-rule bg-paper px-3 py-2"
    >
      {TABS.map((t) => {
        const isActive = active === t.id;
        const count = counts[t.id];
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            data-testid={`filter-${t.id}`}
            className={[
              "flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-mono text-mono-sm transition",
              isActive
                ? "bg-brandBlack text-paper"
                : "text-ink-2 hover:bg-paper-2",
            ].join(" ")}
          >
            <span>{t.label}</span>
            {count !== undefined && (
              <span
                className={[
                  "rounded-sm px-1 text-[10px] font-semi tabular-nums",
                  isActive ? "bg-paper/20 text-paper" : "bg-paper-3 text-ink-3",
                ].join(" ")}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
