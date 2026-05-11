import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { BadgeKind } from "@fsi-bank/components";
import type { ClockEvent } from "../lib/data";

export interface ClockEventRowProps {
  event: ClockEvent;
}

const actorBadge: Record<ClockEvent["actor"], BadgeKind> = {
  system: "neutral",
  service: "info",
  agent: "accent",
  human: "success",
  gate: "warning",
};

const actorGlyph: Record<ClockEvent["actor"], string> = {
  system: "·",
  service: "▢",
  agent: "◆",
  human: "◉",
  gate: "▮",
};

const formatDaysRemaining = (d: number): string => {
  if (d <= 0) return "0 d remaining (breached)";
  if (d < 1) return `${Math.round(d * 24)} h remaining`;
  return `${d.toFixed(1)} d remaining`;
};

/**
 * One event row anchored to the SAR clock. The left rail shows the
 * days-remaining anchor; the right side shows the event content. Pure
 * presentation — no business logic.
 */
export const ClockEventRow: React.FC<ClockEventRowProps> = ({ event }) => {
  const isCritical = event.daysRemaining <= 4 && event.daysRemaining > 0;
  const isBreached = event.daysRemaining <= 0;

  return (
    <li
      className="grid grid-cols-[10rem_1fr] gap-4 border-b border-rule px-4 py-3 last:border-b-0"
      aria-label={`${event.speaker} ${event.headline}`}
    >
      {/* Left rail — clock anchor */}
      <div className="flex flex-col gap-1">
        <span
          className={[
            "font-mono text-xs tabular-nums",
            isBreached
              ? "text-semantic-danger"
              : isCritical
                ? "text-semantic-warning"
                : "text-ink-2",
          ].join(" ")}
        >
          {formatDaysRemaining(event.daysRemaining)}
        </span>
        <span className="font-mono text-xs text-ink-3 tabular-nums">
          day {event.daySinceDetection.toFixed(1)} / 30
        </span>
        <span className="font-mono text-xs text-ink-4 tabular-nums">
          {event.at.slice(0, 10)}
        </span>
      </div>

      {/* Right side — event content */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span aria-hidden className="font-mono text-base text-ink-3">
            {actorGlyph[event.actor]}
          </span>
          <span className="font-mono text-mono-sm text-ink-3">
            {event.speaker}
          </span>
          <StatusBadge kind={actorBadge[event.actor]}>{event.actor}</StatusBadge>
        </div>
        <div className="text-ui text-ink-1">{event.headline}</div>
        {event.detail && (
          <div className="text-caption text-ink-3">{event.detail}</div>
        )}
        {event.meta && (
          <div className="flex flex-wrap gap-3 font-mono text-xs text-ink-3">
            {event.meta.latencyMs !== undefined && (
              <span>latency {event.meta.latencyMs} ms</span>
            )}
            {event.meta.tokensIn !== undefined && (
              <span>
                tokens {event.meta.tokensIn} in / {event.meta.tokensOut ?? 0} out
              </span>
            )}
            {event.meta.confidence !== undefined && (
              <span>conf {(event.meta.confidence * 100).toFixed(0)}%</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
};
