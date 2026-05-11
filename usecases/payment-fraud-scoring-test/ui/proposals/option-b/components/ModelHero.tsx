import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { ScoreBucket } from "../lib/data";

export interface ModelHeroProps {
  histogram: readonly ScoreBucket[];
  thresholds: { approve_max: number; decline_min: number };
  /** Where on the curve the highlighted sample landed (idx into the bucket array). */
  highlightIdx?: number;
  /** Optional label shown next to the highlight marker (e.g. "TX-26F4-001 · 0.58"). */
  highlightLabel?: string;
  /** Pre-computed totals so the component does no math the page is responsible for. */
  totalSamples: number;
  maxBucketCount: number;
}

const bandColor: Record<ScoreBucket["band"], string> = {
  approve: "bg-semantic-success",
  gray: "bg-semantic-warning",
  decline: "bg-semantic-danger",
};

const bandTint: Record<ScoreBucket["band"], string> = {
  approve: "bg-semantic-successTint",
  gray: "bg-semantic-warningTint",
  decline: "bg-semantic-dangerTint",
};

/**
 * The model's score distribution rendered as the page hero. Each
 * vertical bar is one bucket of width 0.05. Bar colour reflects the
 * band the bucket falls into (approve / gray / decline). A single
 * optional highlight pin shows where the active sample landed.
 *
 * Server component — purely presentational. No math the page wouldn't
 * recompute (totals are passed in).
 */
export const ModelHero: React.FC<ModelHeroProps> = ({
  histogram,
  thresholds,
  highlightIdx,
  highlightLabel,
  totalSamples,
  maxBucketCount,
}) => (
  <section
    aria-label="Score distribution over the last hour"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
      <div>
        <div className="eyebrow">Score distribution · last hour</div>
        <h2 className="font-serif text-h3 font-semi text-ink-1">
          The model, right now
        </h2>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge kind="success">approve &lt; {thresholds.approve_max.toFixed(2)}</StatusBadge>
        <StatusBadge kind="warning">gray band</StatusBadge>
        <StatusBadge kind="danger">decline ≥ {thresholds.decline_min.toFixed(2)}</StatusBadge>
      </div>
    </header>

    <div className="px-4 py-4">
      {/* The histogram itself — 20 vertical bars, scaled to the tallest. */}
      <ol
        aria-label="Score buckets"
        className="flex h-44 items-end gap-1"
      >
        {histogram.map((b, i) => {
          const pct = b.count / maxBucketCount;
          const h = Math.max(2, Math.round(pct * 168));
          const isHighlight = highlightIdx === i;
          return (
            <li
              key={`${b.lo}-${b.hi}`}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${b.lo.toFixed(2)}–${b.hi.toFixed(2)}: ${b.count.toLocaleString()} tx · ${b.band}`}
            >
              <div className="flex h-44 w-full flex-col justify-end">
                <div
                  aria-hidden
                  style={{ height: `${h}px` }}
                  className={[
                    "w-full rounded-t-sm",
                    bandColor[b.band],
                    isHighlight ? "ring-2 ring-ink-1 ring-offset-1" : "",
                  ].join(" ")}
                />
              </div>
              <span className="font-mono text-xs text-ink-3 tabular-nums">
                {b.lo.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Highlight badge — only shown when the active sample lies on the curve. */}
      {highlightIdx !== undefined && highlightLabel && (
        <p className="mt-3 font-mono text-mono-sm text-ink-2">
          ↑ this sample · {highlightLabel}
        </p>
      )}

      {/* Footer — total samples + band tallies. The page passes pre-computed
          totals; nothing is re-derived here. */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(["approve", "gray", "decline"] as const).map((band) => {
          const c = histogram
            .filter((b) => b.band === band)
            .reduce((acc, b) => acc + b.count, 0);
          const pct = totalSamples === 0 ? 0 : (c / totalSamples) * 100;
          return (
            <div
              key={band}
              className={`rounded-sm border border-rule px-3 py-2 ${bandTint[band]}`}
            >
              <div className="eyebrow capitalize">{band}</div>
              <div className="mt-0.5 font-serif text-h4 font-semi text-ink-1 tabular-nums">
                {c.toLocaleString()}
              </div>
              <div className="font-mono text-mono-sm text-ink-3 tabular-nums">
                {pct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);
