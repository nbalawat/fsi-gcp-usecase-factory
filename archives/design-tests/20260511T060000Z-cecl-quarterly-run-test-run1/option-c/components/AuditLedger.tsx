import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { AuditRow, AuditActor } from "../lib/data";

export interface AuditLedgerProps {
  rows: AuditRow[];
  /** Limit; defaults to all */
  limit?: number;
}

const actorTone: Record<AuditActor, "info" | "accent" | "success" | "warning" | "neutral"> = {
  system: "neutral",
  service: "info",
  agent: "accent",
  human: "success",
  gate: "warning",
};

const actorEmoji: Record<AuditActor, string> = {
  system: "▣",
  service: "⚙",
  agent: "✦",
  human: "◉",
  gate: "▲",
};

/**
 * The audit ledger renders the canvas event stream as a chronological
 * list. Every Pub/Sub event becomes one row — event-spine-first. No
 * decisions are made here; this is the regulator-ready record of
 * everything the run did.
 *
 * Server component — pure display, no interactivity.
 */
export const AuditLedger: React.FC<AuditLedgerProps> = ({ rows, limit }) => {
  const slice = limit ? rows.slice(0, limit) : rows;
  return (
    <section
      aria-label="Audit ledger"
      className="flex flex-col rounded-md border border-rule bg-paper"
    >
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-2">
        <div>
          <div className="eyebrow">Audit ledger</div>
          <h3 className="font-serif text-h4 font-semi text-ink-1">
            Pipeline events ({rows.length})
          </h3>
        </div>
        <span className="font-mono text-mono-sm text-ink-3">
          event-spine · pub/sub
        </span>
      </header>
      <ol className="divide-y divide-rule">
        {slice.map((r) => (
          <li
            key={r.idx}
            data-idx={r.idx}
            data-actor={r.actor}
            className="flex items-start gap-3 px-4 py-2"
          >
            <span
              aria-hidden
              className={`font-mono text-mono-sm ${
                r.actor === "agent"
                  ? "text-stageType-agent"
                  : r.actor === "service"
                    ? "text-stageType-mixed"
                    : r.actor === "human"
                      ? "text-stageType-human"
                      : r.actor === "gate"
                        ? "text-semantic-warning"
                        : "text-ink-3"
              }`}
            >
              {actorEmoji[r.actor]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-mono-sm font-medium text-ink-1">
                  {r.headline}
                </span>
                <span className="shrink-0 font-mono text-caption text-ink-3 tabular-nums">
                  {r.at.substring(11, 19)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-caption text-ink-3">
                <span>{r.speaker}</span>
                {r.detail && (
                  <>
                    <span>·</span>
                    <span>{r.detail}</span>
                  </>
                )}
                {r.decision && (
                  <StatusBadge kind={actorTone[r.actor]}>
                    {r.decision}
                  </StatusBadge>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
};
