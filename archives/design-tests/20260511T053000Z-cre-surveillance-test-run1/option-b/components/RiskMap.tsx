import * as React from "react";
import { RegionMapTile } from "./RegionMapTile";
import { StateClusterRow } from "./StateClusterRow";
import type { RegionAggregate, StateCluster } from "../lib/data";

export interface RiskMapProps {
  regions: RegionAggregate[];
  clusters: StateCluster[];
}

/**
 * The 4-region census map. NOT a side rail — this is the page spine.
 *
 * Layout is a 2x2 grid that approximates US geography:
 *   ┌─────────┬─────────┐
 *   │  West   │  Midwest│   (top row = north)
 *   ├─────────┼─────────┤
 *   │  West   │ Northeast│ (Northeast is top-right by census)
 *   └─────────┴─────────┘
 *
 * For accessibility and to keep the metaphor legible, we use a 2x2 grid
 * with regions placed in their canonical US-map quadrants:
 *   row 1: [West] [Midwest, Northeast]
 *   row 2: [West] [South]
 *
 * In practice — a single 4-up grid that pairs the regions in their
 * approximate north/south, west/east relationship. Below the grid, a
 * detail strip lists the state clusters with the highest watch density.
 */
export const RiskMap: React.FC<RiskMapProps> = ({ regions, clusters }) => {
  // Canonical census-region positioning. Keep keys stable so React can
  // diff predictably.
  const byRegion = Object.fromEntries(
    regions.map((r) => [r.region, r]),
  ) as Record<string, RegionAggregate>;

  return (
    <section
      aria-label="US census-region risk map"
      className="rounded-md border border-rule bg-paper p-4"
    >
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <div className="eyebrow">Geography is the spine</div>
          <h2 className="font-serif text-h2 font-semi text-ink-1">
            Watchlist concentration · US census regions
          </h2>
        </div>
        <div className="font-mono text-mono-sm text-ink-3">
          tile = aggregate watch density · click → drill into state clusters
        </div>
      </header>

      {/* 2x2 grid approximating US geography. Token-only sizes. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {byRegion["West"] && (
          <RegionMapTile agg={byRegion["West"]} short="W" />
        )}
        {byRegion["Midwest"] && (
          <RegionMapTile agg={byRegion["Midwest"]} short="MW" />
        )}
        {byRegion["South"] && (
          <RegionMapTile agg={byRegion["South"]} short="S" />
        )}
        {byRegion["Northeast"] && (
          <RegionMapTile agg={byRegion["Northeast"]} short="NE" />
        )}
      </div>

      {/* Detail strip: state-cluster rows, grouped by region anchor. */}
      <div className="mt-6">
        <header className="mb-3 flex items-baseline justify-between gap-2">
          <div className="eyebrow">Drill</div>
          <h3 className="text-h4 font-semi text-ink-1">State clusters</h3>
        </header>
        <ol className="flex flex-col gap-2">
          {clusters
            .slice()
            .sort((a, b) => b.heatLevel - a.heatLevel || b.watchCount - a.watchCount)
            .map((c) => (
              <StateClusterRow key={c.state} cluster={c} />
            ))}
        </ol>
      </div>
    </section>
  );
};
