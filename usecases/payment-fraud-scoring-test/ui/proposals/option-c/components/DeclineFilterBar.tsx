"use client";

import * as React from "react";
import type { DeclineFilter } from "../lib/data";

const OPTIONS: { id: DeclineFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "decline", label: "Declined" },
  { id: "step-up", label: "Step-up" },
  { id: "high-score", label: "High-score (≥ 0.80)" },
];

export interface DeclineFilterBarProps {
  active: DeclineFilter;
  counts: Partial<Record<DeclineFilter, number>>;
  onChange: (next: DeclineFilter) => void;
}

/**
 * Tabs that filter the decline stream. Real `<button onClick>` — the
 * auditor blocks bare div-as-button. Filter state is URL-less (this is
 * a fast scrub, not a permalink).
 */
export const DeclineFilterBar: React.FC<DeclineFilterBarProps> = ({
  active,
  counts,
  onChange,
}) => (
  <div
    role="tablist"
    aria-label="Decline stream filter"
    className="flex flex-wrap items-center gap-2 border-b border-rule bg-paper px-4 py-3"
  >
    <span className="text-xs font-medium uppercase tracking-wider text-ink-3 mr-2">
      View
    </span>
    {OPTIONS.map((o) => {
      const isActive = active === o.id;
      const c = counts[o.id] ?? 0;
      return (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(o.id)}
          className={[
            "rounded-sm border px-3 py-1 font-mono text-mono-sm transition",
            isActive
              ? "border-accent bg-accent-tint text-accent-pressed"
              : "border-rule bg-paper text-ink-2 hover:bg-paper-2",
          ].join(" ")}
        >
          {o.label}
          <span className="ml-1.5 text-ink-3">· {c}</span>
        </button>
      );
    })}
  </div>
);
