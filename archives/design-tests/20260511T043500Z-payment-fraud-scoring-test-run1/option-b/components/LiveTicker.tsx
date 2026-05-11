import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { LiveEventRow } from "../lib/data";

const actorTone: Record<
  LiveEventRow["actor"],
  "success" | "warning" | "info" | "accent" | "neutral"
> = {
  system: "neutral",
  service: "info",
  agent: "accent",
  score: "warning",
  decision: "success",
};

const formatClock = (iso: string): string => iso.substring(11, 23);

export interface LiveTickerProps {
  rows: readonly LiveEventRow[];
}

/**
 * Compressed live event ticker — the model's heartbeat. Shows the most
 * recent service / score / agent / decision events. Each row pinned to
 * a millisecond clock so the operator can see the sub-second latency
 * budget being kept.
 *
 * Server component — purely presentational.
 */
export const LiveTicker: React.FC<LiveTickerProps> = ({ rows }) => (
  <section
    aria-label="Live event ticker"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
      <div>
        <div className="eyebrow">Live · sub-second decisions</div>
        <h2 className="font-serif text-h3 font-semi text-ink-1">
          Event ticker
        </h2>
      </div>
      <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
        {rows.length} events
      </span>
    </header>
    {rows.length === 0 ? (
      <p className="px-4 py-6 text-caption text-ink-3">
        No events on the wire.
      </p>
    ) : (
      <ol className="flex flex-col">
        {rows.map((r) => (
          <li
            key={r.idx}
            className="grid grid-cols-[7rem_5rem_1fr_auto] items-center gap-3 border-b border-rule px-4 py-2 last:border-b-0"
          >
            <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
              {formatClock(r.at)}
            </span>
            <StatusBadge kind={actorTone[r.actor]}>{r.actor}</StatusBadge>
            <span className="text-ui text-ink-1">{r.headline}</span>
            <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
              {r.meta?.latencyMs !== undefined && `${r.meta.latencyMs}ms`}
              {r.meta?.confidence !== undefined &&
                ` · conf ${r.meta.confidence.toFixed(2)}`}
              {r.meta?.tokensIn !== undefined &&
                ` · ${r.meta.tokensIn}/${r.meta.tokensOut ?? 0} tok`}
            </span>
          </li>
        ))}
      </ol>
    )}
  </section>
);
