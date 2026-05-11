import * as React from "react";
import Link from "next/link";
import type { RegionAggregate } from "../lib/data";
import { fmtUsd } from "../lib/data";

export interface RegionMapTileProps {
  agg: RegionAggregate;
  /** Optional grid-position label rendered as a small caption (NE, MW…) */
  short: string;
  /** Highlight (e.g. when the user has clicked into this region) */
  active?: boolean;
}

/** Heat-level → token-only background + foreground. NO arbitrary values. */
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

const HEAT_LABEL: Record<RegionAggregate["heatLevel"], string> = {
  0: "no watch",
  1: "low",
  2: "moderate",
  3: "elevated",
  4: "severe",
};

/**
 * A single region tile of the geographic map. The whole tile is a
 * link — wrapping a <Link href> per the UI-standards rule that whole
 * cards are clickable. NO bare <button> for nav.
 *
 * Server component (no interactivity).
 */
export const RegionMapTile: React.FC<RegionMapTileProps> = ({
  agg,
  short,
  active = false,
}) => {
  const watchShare =
    agg.facilityCount === 0
      ? 0
      : Math.round((agg.watchCount / agg.facilityCount) * 100);
  return (
    <Link
      href={`#region-${agg.region.toLowerCase()}`}
      aria-label={`${agg.region} region — ${agg.watchCount} of ${agg.facilityCount} on watch`}
      className={[
        "group flex h-full flex-col rounded-md border p-4 transition",
        HEAT_BG[agg.heatLevel],
        HEAT_FG[agg.heatLevel],
        active ? "border-accent ring-2 ring-accent" : "border-rule hover:border-ink-2",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-mono-sm uppercase tracking-wider opacity-80">
          {short}
        </span>
        <span className="font-mono text-mono-sm opacity-80">
          {HEAT_LABEL[agg.heatLevel]}
        </span>
      </div>
      <div className="mt-2 font-serif text-h2 font-semi leading-none">
        {agg.region}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-mono-sm">
        <div>
          <div className="opacity-75">Facilities</div>
          <div className="font-mono text-h3 font-semi tabular-nums">
            {agg.facilityCount}
          </div>
        </div>
        <div>
          <div className="opacity-75">Watch</div>
          <div className="font-mono text-h3 font-semi tabular-nums">
            {agg.watchCount}
            <span className="ml-1 text-mono-sm opacity-75">({watchShare}%)</span>
          </div>
        </div>
      </div>
      <div className="mt-3 border-t border-current pt-2 opacity-80">
        <div className="text-mono-sm">Total exposure</div>
        <div className="font-mono text-body-sm font-semi tabular-nums">
          {fmtUsd(agg.totalExposureUsd)}
        </div>
      </div>
    </Link>
  );
};
