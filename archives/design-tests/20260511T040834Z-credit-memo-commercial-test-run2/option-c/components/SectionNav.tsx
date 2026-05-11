import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { SectionState } from "../lib/data";

const statusBadge = (
  s: SectionState["status"],
): "success" | "warning" | "neutral" => {
  if (s === "completed") return "success";
  if (s === "pending") return "warning";
  return "neutral";
};

const statusLabel: Record<SectionState["status"], string> = {
  completed: "closed",
  pending: "awaiting",
  queued: "queued",
};

export interface SectionNavProps {
  sections: SectionState[];
}

/**
 * Anchor-link rail down the right side of the case page. Each entry is
 * a REAL <a href="#section-…"> — clicking jumps to that section. Status
 * badge mirrors the section's gate state.
 *
 * Per ui-standards: every nav item must have an href. The factory
 * already paid for "<button> for nav without onClick / href" mistakes.
 */
export const SectionNav: React.FC<SectionNavProps> = ({ sections }) => (
  <nav
    aria-label="Memo sections"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="border-b border-rule px-3 py-2">
      <div className="eyebrow">Memo sections</div>
      <h3 className="text-sm font-semibold text-ink-1">Jump to</h3>
    </header>
    <ol className="flex flex-col">
      {sections.map((s, i) => (
        <li
          key={s.id}
          className="border-b border-rule last:border-b-0"
        >
          <a
            href={`#section-${s.id}`}
            className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-paper-2"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="truncate text-sm text-ink-1">{s.title}</span>
            </span>
            <StatusBadge kind={statusBadge(s.status)}>
              {statusLabel[s.status]}
            </StatusBadge>
          </a>
        </li>
      ))}
    </ol>
  </nav>
);
