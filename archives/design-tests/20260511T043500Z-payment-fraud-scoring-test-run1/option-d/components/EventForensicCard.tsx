import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import {
  clockOf,
  decisionBadge,
  labelOfFeature,
  labelOfMcc,
  type FiringEvent,
} from "../lib/data";

export interface EventForensicCardProps {
  event: FiringEvent;
}

/**
 * Per-event forensic card. Shows the event identity, the decision, the
 * score, the agent confidence, and the contributing features (each one
 * a link back to its cell on the home page). Pure presentation — no
 * scoring, no thresholding.
 */
export const EventForensicCard: React.FC<EventForensicCardProps> = ({
  event,
}) => (
  <section
    aria-label="Event forensic"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
      <div className="min-w-0">
        <div className="eyebrow">Event</div>
        <h2 className="font-serif text-xl font-semibold text-ink-1">
          {event.merchant}
        </h2>
        <div className="mt-1 flex flex-wrap gap-3 font-mono text-xs text-ink-3">
          <span>{event.id}</span>
          <span>·</span>
          <span>{clockOf(event.at)} UTC</span>
          <span>·</span>
          <span>card ****{event.cardLast4}</span>
          <span>·</span>
          <span>MCC {event.mcc} {labelOfMcc(event.mcc)}</span>
        </div>
      </div>
      <StatusBadge kind={decisionBadge(event.decision)}>
        {event.decision}
      </StatusBadge>
    </header>

    <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-3">
      <div>
        <div className="eyebrow">Amount</div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-ink-1">
          ${event.amountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      </div>
      <div>
        <div className="eyebrow">Score</div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-ink-1">
          {event.score}
          <span className="ml-1 text-base text-ink-3">/ 100</span>
        </div>
      </div>
      <div>
        <div className="eyebrow">Model confidence</div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-ink-1">
          {Math.round(event.modelConfidence * 100)}%
        </div>
      </div>
    </div>

    <div className="border-t border-rule px-4 py-4">
      <div className="eyebrow mb-2">Contributing features</div>
      {event.features.length === 0 ? (
        <p className="text-xs text-ink-3">
          No features over threshold for this event.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {event.features.map((fid) => (
            <li key={fid}>
              <a
                href={`/?cell=${fid}::${event.mcc}`}
                className="inline-flex items-center gap-1 rounded-sm border border-rule bg-paper-2 px-2 py-1 font-mono text-xs text-ink-1 hover:bg-accent-tint"
                title={`Back to heatmap cell ${labelOfFeature(fid)} × ${labelOfMcc(event.mcc)}`}
              >
                <span className="text-accent-pressed">◆</span>
                {labelOfFeature(fid)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  </section>
);
