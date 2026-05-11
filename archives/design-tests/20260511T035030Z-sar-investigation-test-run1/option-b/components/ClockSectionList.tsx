import * as React from "react";
import { ClockEventRow } from "./ClockEventRow";
import type { ClockSection } from "../lib/data";

export interface ClockSectionListProps {
  sections: ClockSection[];
  approvalHref: string;
}

/**
 * The case content as a sequence of clock-anchored sections. Every section
 * is one band of the 30-day SAR axis; events inside the band render in
 * temporal order with a days-remaining anchor in the left rail.
 *
 * Server component — pure presentation.
 */
export const ClockSectionList: React.FC<ClockSectionListProps> = ({
  sections,
  approvalHref,
}) => {
  return (
    <ol
      aria-label="Investigation timeline along the 30-day SAR clock"
      className="flex flex-col gap-4"
    >
      {sections.map((s) => {
        const empty = s.events.length === 0;
        return (
          <li
            key={s.bucket}
            className="rounded-md border border-rule bg-paper"
            aria-label={s.label}
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
              <div>
                <div className="eyebrow">{s.label}</div>
                <h3 className="font-serif text-lg font-medium text-ink-1">
                  {s.subtitle}
                </h3>
              </div>
              <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
                {s.events.length} {s.events.length === 1 ? "event" : "events"}
              </span>
            </header>
            {empty ? (
              <p className="px-4 py-6 text-caption text-ink-3">
                No events recorded in this band yet.
              </p>
            ) : (
              <ol className="flex flex-col">
                {s.events.map((e) => (
                  <ClockEventRow key={e.idx} event={e} />
                ))}
              </ol>
            )}
            {s.bucket === "day-26-30-review" && !empty && (
              <footer className="border-t border-rule bg-paper-2 px-4 py-3">
                <a
                  href={approvalHref}
                  className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:opacity-90"
                >
                  Open SAR signoff →
                </a>
              </footer>
            )}
          </li>
        );
      })}
    </ol>
  );
};
