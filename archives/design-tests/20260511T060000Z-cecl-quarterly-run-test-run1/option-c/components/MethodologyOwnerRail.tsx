import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { MethodologyOwnerStat } from "../lib/data";

export interface MethodologyOwnerRailProps {
  stats: MethodologyOwnerStat[];
}

/**
 * Compact right-rail showing methodology owners and how many segments
 * still need their attention. Banker-vocabulary, no math, no decisions.
 * Server component.
 */
export const MethodologyOwnerRail: React.FC<MethodologyOwnerRailProps> = ({
  stats,
}) => {
  return (
    <aside
      aria-label="Methodology owners"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="border-b border-rule px-4 py-2">
        <div className="eyebrow">Methodology owners</div>
        <h3 className="font-serif text-h4 font-semi text-ink-1">
          Pending attention
        </h3>
      </header>
      <ul className="flex flex-col">
        {stats.map((s) => (
          <li
            key={s.owner}
            className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-mono-sm font-medium text-ink-1">
                {s.owner.split(",")[0]}
              </div>
              <div className="truncate font-mono text-caption text-ink-3">
                {s.owner.split(",")[1]?.trim()}
              </div>
            </div>
            <StatusBadge
              kind={s.awaiting === 0 ? "success" : "warning"}
            >
              {s.awaiting === 0
                ? `${s.segmentCount} done`
                : `${s.awaiting} / ${s.segmentCount} awaiting`}
            </StatusBadge>
          </li>
        ))}
      </ul>
    </aside>
  );
};
