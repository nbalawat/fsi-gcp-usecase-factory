import * as React from "react";
import { REVIEW_PATTERN, SAFETY_RAILS, AGENT_LEARNING } from "../lib/data";

/**
 * UC-OWNED right rail. Three panels per console-recommendations spec:
 * review pattern (calibration), agent learning (closing the loop),
 * safety rails (compliance comfort).
 */
export const RightRail: React.FC = () => (
  <aside
    aria-label="Recommendations right rail"
    className="flex w-full flex-col gap-6 border-l border-rule bg-paper-2/40 p-5 lg:w-80"
  >
    <section className="flex flex-col gap-3">
      <h3 className="eyebrow">Your review pattern · 30d</h3>
      <ReviewBar label="Accepted as drafted" pct={REVIEW_PATTERN.accepted_as_drafted.pct} count={REVIEW_PATTERN.accepted_as_drafted.count} tone="bg-semantic-success" />
      <ReviewBar label="Accepted with edits" pct={REVIEW_PATTERN.accepted_with_edits.pct} count={REVIEW_PATTERN.accepted_with_edits.count} tone="bg-accent" />
      <ReviewBar label="Deferred"            pct={REVIEW_PATTERN.deferred.pct}            count={REVIEW_PATTERN.deferred.count}            tone="bg-semantic-warning" />
      <ReviewBar label="Rejected"            pct={REVIEW_PATTERN.rejected.pct}            count={REVIEW_PATTERN.rejected.count}            tone="bg-semantic-danger" />
    </section>

    <section className="flex flex-col gap-2 rounded-md border border-accent/30 bg-accent-tint/40 p-3">
      <h3 className="eyebrow text-accent-pressed">Agent learning</h3>
      <p className="font-serif text-ui leading-relaxed text-ink-1">
        {AGENT_LEARNING.observation}
      </p>
      <div className="font-mono text-mono-sm text-ink-3">
        Applied {AGENT_LEARNING.appliedAt}
      </div>
    </section>

    <section className="flex flex-col gap-2">
      <h3 className="eyebrow">Safety rails</h3>
      <ul className="flex flex-col gap-1 text-ui text-ink-2">
        {SAFETY_RAILS.map((r) => (
          <li key={r} className="flex gap-2">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </section>
  </aside>
);

interface ReviewBarProps {
  label: string;
  pct: number;
  count: number;
  tone: string;
}

const ReviewBar: React.FC<ReviewBarProps> = ({ label, pct, count, tone }) => (
  <div>
    <div className="flex items-baseline justify-between text-ui">
      <span className="text-ink-2">{label}</span>
      <span className="font-mono text-mono-sm tabular-nums text-ink-1">
        {count} ({pct}%)
      </span>
    </div>
    <div className="mt-1 h-1.5 w-full rounded-sm bg-paper-3">
      <div
        className={`h-1.5 rounded-sm ${tone}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  </div>
);
