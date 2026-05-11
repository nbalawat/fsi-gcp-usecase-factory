"use client";

import * as React from "react";
import type { GraphFilter } from "../lib/data";

export interface GraphFilterTabsProps {
  /** Currently active filter id */
  active: GraphFilter;
  /** Per-filter counts (for the badge on each tab) */
  counts: Record<GraphFilter, number>;
  /** Build the href for switching to a filter (preserves selected node) */
  buildHref: (filter: GraphFilter) => string;
}

const TABS: Array<{ id: GraphFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "extracted", label: "Extracted" },
  { id: "computed", label: "Computed" },
  { id: "decided", label: "Decided" },
  { id: "low-confidence", label: "Low confidence" },
];

/**
 * Filter tabs for the provenance graph. Each tab is an anchor — Server
 * components can drive the page from the resulting URL — but we still
 * mark this client-only so `aria-selected` updates after hydration.
 */
export const GraphFilterTabs: React.FC<GraphFilterTabsProps> = ({
  active,
  counts,
  buildHref,
}) => (
  <div
    role="tablist"
    aria-label="Filter value graph by origin"
    className="flex flex-wrap gap-1 border-b border-rule px-6 py-2"
  >
    {TABS.map((t) => {
      const isActive = active === t.id;
      const count = counts[t.id];
      return (
        <a
          key={t.id}
          role="tab"
          aria-selected={isActive}
          href={buildHref(t.id)}
          className={
            "rounded-sm px-3 py-1.5 font-mono text-xs transition-colors " +
            (isActive
              ? "bg-ink-1 text-paper"
              : "text-ink-2 hover:bg-paper-2")
          }
        >
          {t.label}
          <span
            className={
              "ml-2 rounded-sm px-1.5 py-0.5 font-mono text-xs " +
              (isActive ? "bg-paper text-ink-1" : "bg-paper-3 text-ink-3")
            }
          >
            {count}
          </span>
        </a>
      );
    })}
  </div>
);
