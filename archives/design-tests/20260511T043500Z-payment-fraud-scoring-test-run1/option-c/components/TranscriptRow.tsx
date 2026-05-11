import * as React from "react";
import type { TranscriptRow as TranscriptRowData } from "../lib/data";

function clockOf(iso: string): string {
  return iso.substring(11, 19);
}

const ACTOR_META: Record<
  TranscriptRowData["actor"],
  { glyph: string; tone: string; ring: string; label: string }
> = {
  system:  { glyph: "·", tone: "bg-paper-2 text-ink-3",                   ring: "ring-rule",                    label: "system" },
  service: { glyph: "▢", tone: "bg-accent-tint text-accent-pressed",      ring: "ring-accent/40",               label: "service" },
  agent:   { glyph: "◆", tone: "bg-semantic-infoTint text-semantic-info", ring: "ring-semantic-info/40",        label: "agent" },
  rule:    { glyph: "▮", tone: "bg-semantic-warningTint text-semantic-warning", ring: "ring-semantic-warning/40", label: "rule" },
  decline: { glyph: "✕", tone: "bg-semantic-dangerTint text-semantic-danger", ring: "ring-semantic-danger/40",  label: "decline" },
};

export interface TranscriptRowProps {
  row: TranscriptRowData;
  children?: React.ReactNode;
}

/**
 * One row of the per-transaction processing transcript. Used on the
 * single-case page to render the agent / service path that produced the
 * decline. Pure presentation — receives a shaped row from the adapter.
 */
export const TranscriptRow: React.FC<TranscriptRowProps> = ({ row, children }) => {
  const meta = ACTOR_META[row.actor];
  return (
    <li
      data-row-idx={row.idx}
      data-actor={row.actor}
      className="flex gap-3 border-b border-rule px-4 py-3 last:border-b-0 hover:bg-paper-2"
    >
      <span className="w-16 flex-shrink-0 pt-0.5 font-mono text-mono-sm tabular-nums text-ink-3">
        {clockOf(row.at)}
      </span>
      <span
        aria-hidden
        title={meta.label}
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ring-1 ${meta.tone} ${meta.ring} text-sm font-semibold`}
      >
        {meta.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-mono-sm uppercase tracking-wider text-ink-3">
            {meta.label}
          </span>
          <span className="font-mono text-mono-sm truncate text-ink-2">
            {row.speaker}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-ink-1">{row.headline}</p>
        {row.detail && (
          <p className="mt-0.5 text-xs text-ink-3">{row.detail}</p>
        )}
        {row.meta && (
          <div className="mt-1 flex flex-wrap gap-3 font-mono text-mono-sm text-ink-3">
            {row.meta.latencyMs !== undefined && (
              <span>{row.meta.latencyMs}ms</span>
            )}
            {row.meta.tokensIn !== undefined && (
              <span>↑ {row.meta.tokensIn}t</span>
            )}
            {row.meta.tokensOut !== undefined && (
              <span>↓ {row.meta.tokensOut}t</span>
            )}
            {row.meta.confidence !== undefined && (
              <span>conf {Math.round(row.meta.confidence * 100)}%</span>
            )}
            {row.ref && <span className="text-ink-4">ref: {row.ref}</span>}
          </div>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
};
