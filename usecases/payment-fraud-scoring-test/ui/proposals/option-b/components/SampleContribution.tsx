import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { FeatureContribution, FeatureSpec } from "../lib/data";

export interface SampleContributionProps {
  contributions: readonly FeatureContribution[];
  /** Optional lookup so we can render the human label for each feature. */
  featureCatalogue: readonly FeatureSpec[];
}

/**
 * Per-feature contribution table for one sample. Shows: feature label ·
 * value · signed weight. The signed weight is rendered as a horizontal
 * bar centered on zero so the operator can see at a glance which inputs
 * pushed the score up (fraud-like) vs down (safe).
 *
 * Server component — no decision math, just shape rendering.
 */
export const SampleContribution: React.FC<SampleContributionProps> = ({
  contributions,
  featureCatalogue,
}) => {
  const byId: Record<string, FeatureSpec> = {};
  for (const f of featureCatalogue) byId[f.id] = f;
  // Largest |weight| across the contributions — used to normalise the bar.
  let maxAbs = 0;
  for (const c of contributions) {
    if (Math.abs(c.weight) > maxAbs) maxAbs = Math.abs(c.weight);
  }
  const denom = maxAbs === 0 ? 1 : maxAbs;

  return (
    <section
      aria-label="Feature contributions for this sample"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <div>
          <div className="eyebrow">This sample · why the model said what it said</div>
          <h2 className="font-serif text-h3 font-semi text-ink-1">
            Feature contributions
          </h2>
        </div>
        <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
          {contributions.length} inputs
        </span>
      </header>

      {contributions.length === 0 ? (
        <p className="px-4 py-6 text-caption text-ink-3">
          No feature contributions emitted for this sample.
        </p>
      ) : (
        <ul role="list" className="flex flex-col">
          {contributions.map((c) => {
            const feat = byId[c.feature_id];
            const widthPct = Math.round((Math.abs(c.weight) / denom) * 100);
            const pushesUp = c.weight > 0;
            const isZero = c.weight === 0;
            const tone = isZero
              ? "neutral"
              : pushesUp
                ? "danger"
                : "success";
            const signed = `${c.weight > 0 ? "+" : ""}${c.weight.toFixed(2)}`;
            return (
              <li
                key={c.feature_id}
                className="grid grid-cols-[12rem_1fr_5.5rem] items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-ui font-medium text-ink-1">
                    {feat?.label ?? c.feature_id}
                  </div>
                  <div className="font-mono text-mono-sm text-ink-3">
                    {c.feature_id}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    aria-hidden
                    className="relative h-2 w-full rounded-full bg-paper-2"
                  >
                    <div
                      className={[
                        "absolute top-0 h-2",
                        isZero
                          ? "left-1/2 w-px bg-ink-4"
                          : pushesUp
                            ? "left-1/2 bg-semantic-danger"
                            : "right-1/2 bg-semantic-success",
                        "rounded-full",
                      ].join(" ")}
                      style={{ width: isZero ? "1px" : `${widthPct / 2}%` }}
                    />
                  </div>
                  <span className="font-mono text-mono-sm text-ink-2 tabular-nums">
                    {c.value}
                  </span>
                </div>
                <div className="flex justify-end">
                  <StatusBadge kind={tone}>{signed}</StatusBadge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
