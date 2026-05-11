import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { StageBucket } from "../lib/data";

export interface StageFutureListProps {
  buckets: StageBucket[];
}

/**
 * Right rail — future stages, dimmed but visible. Renders just the
 * stage labels and a "queued" badge. The pipeline shape is the page's
 * spine; queued stages are visible so the reviewer knows what's still
 * to come without losing focus on the hero.
 */
export const StageFutureList: React.FC<StageFutureListProps> = ({ buckets }) => {
  if (buckets.length === 0) {
    return (
      <aside
        aria-label="Future workflow stages"
        className="rounded-md border border-rule bg-paper p-3"
      >
        <div className="eyebrow">Workflow · upcoming</div>
        <p className="mt-2 text-caption text-ink-3">
          No further stages — pipeline is complete.
        </p>
      </aside>
    );
  }
  return (
    <aside
      aria-label="Future workflow stages"
      className="flex flex-col gap-2 rounded-md border border-rule bg-paper p-3 opacity-80"
    >
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">Workflow · upcoming</div>
        <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
          {buckets.length} queued
        </span>
      </div>
      <ol className="flex flex-col gap-1">
        {buckets.map((b) => (
          <li
            key={b.id}
            data-stage={b.id}
            className="flex items-center justify-between gap-2 rounded-sm border border-dashed border-rule px-2.5 py-2"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden
                className="h-2 w-2 flex-shrink-0 rounded-full bg-ink-4"
              />
              <span className="text-ui text-ink-3 truncate">{b.label}</span>
            </span>
            <StatusBadge kind="neutral">queued</StatusBadge>
          </li>
        ))}
      </ol>
    </aside>
  );
};
