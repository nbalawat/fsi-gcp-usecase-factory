import * as React from "react";
import type { ActivityEvent } from "../lib/data";

/**
 * UC-OWNED component. The customer's recent activity rendered as a
 * narrative timeline — each event is a one-line story (NOT a data
 * row). The relationship IS the metaphor (option-B axis).
 */
export interface CustomerTimelineProps {
  events: readonly ActivityEvent[];
  /** Optional title override */
  title?: string;
}

export const CustomerTimeline: React.FC<CustomerTimelineProps> = ({
  events,
  title = "Recent activity in this relationship",
}) => (
  <section aria-label="Customer activity timeline" className="flex flex-col gap-2">
    <div className="eyebrow">{title}</div>
    <ol className="flex flex-col gap-0 border-l border-rule pl-4">
      {events.map((e, i) => (
        <li key={i} className="relative py-1.5">
          <span
            aria-hidden
            className="absolute -left-[19px] top-2.5 h-2 w-2 rounded-full bg-ink-3 ring-2 ring-paper"
          />
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
              {e.at}
            </span>
            <span className="text-ui text-ink-1">{e.text}</span>
            {e.amount && (
              <span className="ml-auto font-mono text-mono-sm font-semibold tabular-nums text-ink-1">
                {e.amount}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  </section>
);
