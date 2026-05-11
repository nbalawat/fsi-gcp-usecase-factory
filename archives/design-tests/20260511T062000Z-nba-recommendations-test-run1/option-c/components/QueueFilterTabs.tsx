"use client";

import * as React from "react";
import type { QueueFilter } from "../lib/data";

export interface QueueFilterTabsProps {
  active: QueueFilter;
  counts: Record<QueueFilter, number>;
  onChange: (f: QueueFilter) => void;
}

const TABS: { id: QueueFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "high-uplift", label: "High uplift" },
  { id: "review", label: "Needs review" },
];

/**
 * Tab bar above the queue. Filter is purely visual — every queue row
 * still carries its inline disposition.
 */
export const QueueFilterTabs: React.FC<QueueFilterTabsProps> = ({
  active,
  counts,
  onChange,
}) => (
  <div
    role="tablist"
    aria-label="Queue filters"
    className="flex flex-wrap items-center gap-1 border-b border-rule bg-paper px-6 py-2"
  >
    {TABS.map((t) => {
      const isActive = active === t.id;
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(t.id)}
          className={[
            "rounded-sm px-3 py-1.5 text-ui font-medium",
            isActive
              ? "bg-paper-2 text-ink-1"
              : "text-ink-2 hover:bg-paper-2 hover:text-ink-1",
          ].join(" ")}
        >
          {t.label}
          <span className="ml-2 rounded-sm bg-paper-3 px-1.5 py-0.5 font-mono text-mono-sm text-ink-2">
            {counts[t.id]}
          </span>
        </button>
      );
    })}
  </div>
);
