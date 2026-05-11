import * as React from "react";
import { StatusBadge } from "@primitives";
import type { TimelineRow, TimelineActor } from "../lib/data";

const ACTOR_BADGE: Record<TimelineActor, "info" | "accent" | "success" | "warning" | "neutral"> = {
  system: "neutral",
  service: "info",
  agent: "accent",
  human: "success",
  gate: "warning",
};

export interface TimelineListProps {
  rows: readonly TimelineRow[];
}

/**
 * Read-only audit timeline. Server-rendered. Each PIPELINE_EVENT
 * becomes one row; nothing is dropped, nothing is invented. This is
 * the event-spine-first surface promised by the canvas.
 */
export const TimelineList: React.FC<TimelineListProps> = ({ rows }) => (
  <section
    aria-label="Pipeline timeline"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="border-b border-rule px-4 py-3">
      <div className="eyebrow">Event spine</div>
      <h2 className="font-serif text-h3 font-semi text-ink-1">
        Pipeline timeline
      </h2>
    </header>
    <ol className="flex flex-col">
      {rows.map((r) => (
        <li
          key={r.idx}
          className="grid grid-cols-[8.5rem_5rem_1fr] items-baseline gap-3 border-b border-rule px-4 py-3 last:border-b-0"
        >
          <time className="font-mono text-mono-sm text-ink-3">
            {r.at.replace("T", " ").replace(".000Z", "Z")}
          </time>
          <span>
            <StatusBadge kind={ACTOR_BADGE[r.actor]}>{r.actor}</StatusBadge>
          </span>
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-mono-sm text-ink-2">
                {r.speaker}
              </span>
              <span className="text-ui text-ink-1">{r.headline}</span>
            </div>
            {r.detail && (
              <div className="mt-0.5 text-mono-sm text-ink-3">{r.detail}</div>
            )}
            {r.meta && (
              <div className="mt-0.5 flex gap-3 font-mono text-mono-sm text-ink-3">
                {r.meta.latencyMs !== undefined && (
                  <span>latency {r.meta.latencyMs}ms</span>
                )}
                {r.meta.confidence !== undefined && (
                  <span>confidence {(r.meta.confidence * 100).toFixed(0)}%</span>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  </section>
);
