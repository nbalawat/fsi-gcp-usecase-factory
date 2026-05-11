import * as React from "react";
import type { FeatureSpec } from "../lib/data";

export interface FeatureFiringListProps {
  features: readonly FeatureSpec[];
  /** Total feature count (across all groups) used to render "n of m". */
  totalCount: number;
}

const driftTone = (driftPct: number): { fg: string; label: string } => {
  // |drift| ≥ 5pp is the watch threshold; the canvas rule
  // velocity_threshold_by_mcc currently sits at "watch" for exactly this
  // reason. The tone is purely visual — the band assignment is the
  // single source of truth in mock-data.
  const abs = Math.abs(driftPct);
  if (abs >= 5) {
    return { fg: "text-semantic-warning", label: "drift" };
  }
  if (abs >= 2) {
    return { fg: "text-semantic-info", label: "moving" };
  }
  return { fg: "text-ink-3", label: "stable" };
};

/**
 * The feature-firing list — which inputs are doing the work on the
 * model right now. Each row shows: feature label · group · firing-rate
 * bar · drift indicator · importance pill.
 *
 * Server component. No math beyond formatting; the firing_rate and
 * drift_pct values come straight from the canvas.
 */
export const FeatureFiringList: React.FC<FeatureFiringListProps> = ({
  features,
  totalCount,
}) => (
  <section
    aria-label="Feature firing and drift"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
      <div>
        <div className="eyebrow">Inputs · last hour</div>
        <h2 className="font-serif text-h3 font-semi text-ink-1">
          Features firing
        </h2>
      </div>
      <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
        {features.length} of {totalCount}
      </span>
    </header>

    {features.length === 0 ? (
      <p className="px-4 py-6 text-caption text-ink-3">
        No features in this filter.
      </p>
    ) : (
      <ul role="list" className="flex flex-col">
        {features.map((f) => {
          const firingPct = Math.round(f.firing_rate * 100);
          const drift = driftTone(f.drift_pct);
          const driftLabel =
            f.drift_pct === 0
              ? "0.0pp"
              : `${f.drift_pct > 0 ? "+" : ""}${f.drift_pct.toFixed(1)}pp`;
          return (
            <li
              key={f.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-ui font-medium text-ink-1">
                    {f.label}
                  </span>
                  <span className="font-mono text-mono-sm text-ink-3">
                    {f.group}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div
                    aria-hidden
                    className="h-1.5 w-full max-w-xs rounded-full bg-paper-2"
                  >
                    <div
                      className="h-1.5 rounded-full bg-accent"
                      style={{ width: `${firingPct}%` }}
                    />
                  </div>
                  <span className="font-mono text-mono-sm text-ink-2 tabular-nums">
                    {firingPct}%
                  </span>
                </div>
              </div>
              <span
                className={`font-mono text-mono-sm tabular-nums ${drift.fg}`}
                title={`24h drift · ${drift.label}`}
              >
                {driftLabel}
              </span>
              <span className="rounded-sm border border-rule bg-paper-2 px-2 py-0.5 font-mono text-mono-sm text-ink-2 tabular-nums">
                imp {f.importance.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    )}
  </section>
);
