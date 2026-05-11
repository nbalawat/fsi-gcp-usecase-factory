import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@fsi-bank/components";
import type { StateCluster } from "../lib/data";
import { fmtUsd } from "../lib/data";

export interface StateClusterRowProps {
  cluster: StateCluster;
}

const HEAT_BADGE: Record<
  StateCluster["heatLevel"],
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  0: "success",
  1: "info",
  2: "warning",
  3: "danger",
  4: "danger",
};

const HEAT_LABEL: Record<StateCluster["heatLevel"], string> = {
  0: "no watch",
  1: "low",
  2: "moderate",
  3: "elevated",
  4: "severe",
};

/**
 * One state cluster in the drill strip below the map. The whole row is
 * a link to the first facility in the cluster (anchored case-detail).
 * If the cluster has multiple facilities, each is rendered as a chip
 * with its own link.
 */
export const StateClusterRow: React.FC<StateClusterRowProps> = ({ cluster }) => {
  return (
    <li
      data-state={cluster.state}
      className="flex flex-col gap-2 rounded-md border border-rule bg-paper p-3 md:flex-row md:items-center md:gap-4"
    >
      <div className="flex w-32 flex-shrink-0 flex-col">
        <div className="font-serif text-h3 font-semi tabular-nums text-ink-1">
          {cluster.state}
        </div>
        <div className="font-mono text-mono-sm text-ink-3">
          {cluster.region}
        </div>
      </div>

      <div className="flex w-44 flex-shrink-0 flex-col">
        <div className="eyebrow">Heat</div>
        <StatusBadge kind={HEAT_BADGE[cluster.heatLevel]}>
          {HEAT_LABEL[cluster.heatLevel]} · {cluster.watchCount}/{cluster.facilities.length}
        </StatusBadge>
      </div>

      <div className="flex w-40 flex-shrink-0 flex-col">
        <div className="eyebrow">Exposure</div>
        <div className="font-mono text-body-sm font-semi tabular-nums text-ink-1">
          {fmtUsd(cluster.totalExposureUsd)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {cluster.facilities.map((f) => (
          <Link
            key={f.id}
            href={`/case/${f.id}`}
            className="rounded-sm border border-rule bg-paper-2 px-2 py-1 font-mono text-mono-sm text-ink-1 hover:border-accent hover:bg-accent-tint"
          >
            {f.id}
            {f.watchlist && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-semantic-warning align-middle" />
            )}
          </Link>
        ))}
      </div>
    </li>
  );
};
