"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import { StageEventList } from "./StageEventList";
import { summariseBucket, type StageBucket } from "../lib/data";

export interface StagePriorRailProps {
  /** Stages that are done (already exited). */
  buckets: StageBucket[];
  /** Active stage id — used only to label the rail. */
  activeStageId: string;
}

/**
 * Left rail: prior stages compressed to status pills. Each pill is a
 * button that expands into the bucket's compact event list inline.
 * Stage navigation lives in the page hash/state — we keep it local
 * (URL-less scrub) so the back/forward stack doesn't fill with
 * intermediate inspections.
 */
export const StagePriorRail: React.FC<StagePriorRailProps> = ({
  buckets,
  activeStageId,
}) => {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <aside
      aria-label="Prior workflow stages"
      className="flex flex-col gap-2 rounded-md border border-rule bg-paper p-3"
    >
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">Workflow · prior stages</div>
        <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
          {buckets.length} done
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {buckets.map((b) => {
          const sum = summariseBucket(b);
          const isExpanded = expanded === b.id;
          return (
            <li key={b.id} className="flex flex-col">
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`prior-stage-${b.id}`}
                onClick={() => setExpanded(isExpanded ? null : b.id)}
                className={[
                  "flex items-center justify-between gap-2 rounded-sm border px-2.5 py-2 text-left transition",
                  isExpanded
                    ? "border-accent bg-accent-tint"
                    : "border-rule bg-paper hover:bg-paper-2",
                ].join(" ")}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden
                    className="h-2 w-2 flex-shrink-0 rounded-full bg-semantic-success"
                  />
                  <span className="text-ui font-medium text-ink-1 truncate">
                    {b.label}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge kind="success">done</StatusBadge>
                  <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
                    {sum.totalEvents}
                  </span>
                </span>
              </button>
              {isExpanded && (
                <div
                  id={`prior-stage-${b.id}`}
                  className="mt-1 rounded-sm border border-rule bg-paper-2/60"
                >
                  <StageEventList events={b.events} compact />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-1 font-mono text-mono-sm text-ink-3">
        Active stage: <span className="text-ink-1">{activeStageId}</span>
      </p>
    </aside>
  );
};
