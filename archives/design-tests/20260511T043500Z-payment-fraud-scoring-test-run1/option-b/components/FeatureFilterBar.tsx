"use client";

import * as React from "react";
import { FeatureFiringList } from "./FeatureFiringList";
import {
  filterFeatures,
  type FeatureFilter,
  type FeatureSpec,
} from "../lib/data";

const OPTIONS: { id: FeatureFilter; label: string }[] = [
  { id: "all",       label: "All"       },
  { id: "velocity",  label: "Velocity"  },
  { id: "geo",       label: "Geo"       },
  { id: "device",    label: "Device"    },
  { id: "merchant",  label: "Merchant"  },
  { id: "amount",    label: "Amount"    },
  { id: "tenure",    label: "Tenure"    },
];

export interface FeatureFilterBarProps {
  features: readonly FeatureSpec[];
}

/**
 * Client wrapper around FeatureFiringList that lets the ML-ops operator
 * scrub by feature group. Real buttons with onClick (auditor rule); the
 * filter state lives in component state (no URL query — this is a
 * scrub affordance).
 */
export const FeatureFilterBar: React.FC<FeatureFilterBarProps> = ({
  features,
}) => {
  const [active, setActive] = React.useState<FeatureFilter>("all");
  const counts: Partial<Record<FeatureFilter, number>> = {
    all: features.length,
  };
  for (const f of features) {
    counts[f.group] = (counts[f.group] ?? 0) + 1;
  }
  const filtered = filterFeatures(features, active);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="tablist"
        aria-label="Feature group filter"
        className="flex flex-wrap items-center gap-2 rounded-md border border-rule bg-paper px-4 py-3"
      >
        <span className="eyebrow mr-2">Group</span>
        {OPTIONS.map((o) => {
          const isActive = active === o.id;
          const c = counts[o.id] ?? 0;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(o.id)}
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
      <FeatureFiringList features={filtered} totalCount={features.length} />
    </div>
  );
};
