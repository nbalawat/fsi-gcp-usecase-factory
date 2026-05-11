import * as React from "react";
import type { ScoreFactor } from "../lib/data";

/**
 * Per-transaction score-factor breakdown for /case/[id].
 *
 * Each factor is a single horizontal bar diverging from a centre line:
 * positive contributions (raise the fraud score) extend right; negative
 * contributions (mitigate) extend left. Bar width is proportional to the
 * factor's |contribution| relative to the table's max.
 *
 * Server component — pure render. No interactivity, no rounding logic
 * beyond display formatting.
 *
 * Bar widths use inline `style={{ width: '...%' }}` so we don't introduce
 * arbitrary Tailwind values (Rule 6).
 */
export interface ScoreFactorBarsProps {
  factors: readonly ScoreFactor[];
}

export const ScoreFactorBars: React.FC<ScoreFactorBarsProps> = ({ factors }) => {
  const max = factors.reduce((m, f) => Math.max(m, Math.abs(f.contribution)), 1);

  return (
    <section
      aria-label="Score factor contributions"
      className="rounded-sm border border-rule bg-paper"
    >
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-2">
        <div>
          <div className="eyebrow">gray-zone-fraud-scorer</div>
          <h3 className="font-serif text-h4 font-semi text-ink-1">
            Score factor contributions
          </h3>
        </div>
        <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
          {factors.length} factors
        </span>
      </header>

      <ol className="flex flex-col">
        {factors.map((f) => {
          const pct = Math.round((Math.abs(f.contribution) / max) * 100);
          const isPositive = f.contribution >= 0;
          return (
            <li
              key={f.id}
              className="border-b border-rule px-4 py-2 last:border-b-0"
            >
              <div className="flex items-baseline justify-between font-mono text-mono-sm tabular-nums">
                <span className="text-ink-1">{f.label}</span>
                <span
                  className={
                    isPositive ? "text-semantic-danger" : "text-semantic-success"
                  }
                >
                  {isPositive ? "+" : ""}
                  {f.contribution}
                </span>
              </div>

              <div className="relative mt-1.5 h-2 bg-paper-3">
                {/* Centre tick */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 w-px bg-ink-4"
                />
                <div
                  aria-hidden
                  style={{
                    width: `${pct / 2}%`,
                    left: isPositive ? "50%" : undefined,
                    right: isPositive ? undefined : "50%",
                  }}
                  className={[
                    "absolute inset-y-0",
                    isPositive ? "bg-semantic-danger" : "bg-semantic-success",
                  ].join(" ")}
                />
              </div>

              <p className="mt-1 font-mono text-mono-sm text-ink-3">{f.hint}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
