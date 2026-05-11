"use client";

import * as React from "react";
import type { TranscriptFilter } from "../lib/data";

const OPTIONS: { id: TranscriptFilter; label: string }[] = [
  { id: "all",     label: "All"     },
  { id: "agent",   label: "Agents"  },
  { id: "human",   label: "Humans"  },
  { id: "service", label: "Services"},
  { id: "gate",    label: "Gates"   },
];

export interface ActorFilterBarProps {
  active: TranscriptFilter;
  counts: Partial<Record<TranscriptFilter, number>>;
  onChange: (next: TranscriptFilter) => void;
}

/**
 * Tab strip that filters the transcript by actor type. Real buttons —
 * onClick is required by the auditor. No href because filter state is
 * URL-less (this is the "scrub" affordance — quick toggling).
 */
export const ActorFilterBar: React.FC<ActorFilterBarProps> = ({
  active,
  counts,
  onChange,
}) => (
  <div
    role="tablist"
    aria-label="Transcript filter"
    className="flex flex-wrap items-center gap-2 border-b border-rule bg-paper px-4 py-3"
  >
    <span className="eyebrow mr-2">View</span>
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
