import * as React from "react";
import type { Facility, RegionAggregate, StateCluster } from "../lib/data";
import { fmtUsd } from "../lib/data";

export interface FacilityLocatorProps {
  facility: Facility;
  regions: RegionAggregate[];
  cluster: StateCluster | undefined;
}

/** Heat → background token (must match RegionMapTile palette). */
const HEAT_BG: Record<RegionAggregate["heatLevel"], string> = {
  0: "bg-paper-2",
  1: "bg-semantic-info-tint",
  2: "bg-semantic-warning-tint",
  3: "bg-semantic-danger-tint",
  4: "bg-riskBand-5-loss",
};

const HEAT_FG: Record<RegionAggregate["heatLevel"], string> = {
  0: "text-ink-2",
  1: "text-ink-1",
  2: "text-ink-1",
  3: "text-ink-1",
  4: "text-paper",
};

/**
 * Map-context band shown at the top of the case-detail surface. Keeps
 * the map metaphor consistent across pages: the user dropped INTO a
 * region by clicking the tile, so the region tile is repeated here as
 * the spatial anchor.
 *
 * Server component (no interactivity).
 */
export const FacilityLocator: React.FC<FacilityLocatorProps> = ({
  facility,
  regions,
  cluster,
}) => {
  return (
    <section
      aria-label="Geographic locator"
      className="rounded-md border border-rule bg-paper p-4"
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <div className="eyebrow">You are here</div>
          <h2 className="font-serif text-h3 font-semi text-ink-1">
            {facility.borrower.name} · {facility.state}
          </h2>
        </div>
        <a
          href="/"
          className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
        >
          ← Back to map
        </a>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {regions.map((r) => {
          const active = r.region === facility.region;
          return (
            <div
              key={r.region}
              data-active={active ? "true" : "false"}
              className={[
                "flex flex-col gap-1 rounded-md border p-3",
                HEAT_BG[r.heatLevel],
                HEAT_FG[r.heatLevel],
                active
                  ? "border-accent ring-2 ring-accent"
                  : "border-rule opacity-70",
              ].join(" ")}
            >
              <div className="font-mono text-mono-sm uppercase tracking-wider opacity-80">
                {r.region}
              </div>
              <div className="font-mono text-body-sm font-semi tabular-nums">
                {r.watchCount}/{r.facilityCount} watch
              </div>
              {active && (
                <div className="mt-1 font-mono text-mono-sm">
                  ● facility located here
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cluster && (
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-rule pt-3">
          <div className="flex flex-col">
            <div className="eyebrow">State cluster · {cluster.state}</div>
            <div className="font-mono text-body-sm tabular-nums text-ink-1">
              {cluster.facilities.length} facilities · {cluster.watchCount} on watch · {fmtUsd(cluster.totalExposureUsd)}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cluster.facilities.map((f) => {
              const active = f.id === facility.id;
              return (
                <a
                  key={f.id}
                  href={`/case/${f.id}`}
                  className={[
                    "rounded-sm px-2 py-1 font-mono text-mono-sm",
                    active
                      ? "border border-accent bg-accent text-paper"
                      : "border border-rule bg-paper-2 text-ink-1 hover:bg-accent-tint",
                  ].join(" ")}
                >
                  {f.id}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
