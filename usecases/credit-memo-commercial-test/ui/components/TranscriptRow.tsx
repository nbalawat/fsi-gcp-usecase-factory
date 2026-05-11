import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { TranscriptRow as TranscriptRowData } from "../lib/data";

// Banker-readable timestamp: "08:00:09" — date is implicit (same case).
function clockOf(iso: string): string {
  return iso.substring(11, 19);
}

const actorMeta: Record<
  TranscriptRowData["actor"],
  { glyph: string; tone: string; ring: string; label: string }
> = {
  system:  { glyph: "·",  tone: "bg-paper-2 text-ink-3",                 ring: "ring-rule",                  label: "system" },
  service: { glyph: "▢",  tone: "bg-accent-tint text-accent-pressed",    ring: "ring-accent/40",             label: "service" },
  agent:   { glyph: "◆",  tone: "bg-semantic-infoTint text-semantic-info", ring: "ring-semantic-info/40",    label: "agent" },
  human:   { glyph: "◉",  tone: "bg-semantic-successTint text-semantic-success", ring: "ring-semantic-success/40", label: "human" },
  gate:    { glyph: "▮",  tone: "bg-semantic-warningTint text-semantic-warning", ring: "ring-semantic-warning/40", label: "gate" },
};

const decisionBadgeKind = (decision?: string): "success" | "warning" | "danger" | "neutral" => {
  if (decision === "approve" || decision === "accept") return "success";
  if (decision === "return" || decision === "return_for_revision") return "warning";
  if (decision === "reject" || decision === "decline") return "danger";
  return "neutral";
};

export interface TranscriptRowProps {
  row: TranscriptRowData;
  /** When true, render a "Respond" affordance for pending gate rows that
   *  routes to the approval flow. */
  approvalHref?: string;
  /** Optional child slot rendered indented under the headline (citation
   *  tile, reasoning summary, etc.) */
  children?: React.ReactNode;
}

/**
 * One row of the case transcript. Chat-style: timestamp · actor glyph ·
 * speaker · headline · inline meta. Pending HITL rows get a "Respond"
 * link; completed HITL rows get a decision badge.
 *
 * Pure presentation — receives a fully-shaped row from the adapter.
 */
export const TranscriptRow: React.FC<TranscriptRowProps> = ({
  row,
  approvalHref,
  children,
}) => {
  const meta = actorMeta[row.actor];
  return (
    <li
      data-row-idx={row.idx}
      data-actor={row.actor}
      className="flex gap-3 border-b border-rule px-4 py-3 last:border-b-0 hover:bg-paper-2/40"
    >
      <span className="font-mono text-mono-sm text-ink-3 tabular-nums w-[68px] flex-shrink-0 pt-0.5">
        {clockOf(row.at)}
      </span>
      <span
        aria-hidden
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ring-1 ${meta.tone} ${meta.ring} text-sm font-semibold`}
        title={meta.label}
      >
        {meta.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-mono-sm text-ink-3 uppercase tracking-wide">
            {meta.label}
          </span>
          <span className="font-mono text-mono-sm text-ink-2 truncate">
            {row.speaker}
          </span>
          {row.decision && (
            <StatusBadge kind={decisionBadgeKind(row.decision)}>
              {row.decision}
            </StatusBadge>
          )}
          {row.actor === "gate" && row.gate && approvalHref && (
            <a
              href={approvalHref}
              className="ml-auto rounded-sm border border-accent px-2 py-0.5 font-mono text-mono-sm text-accent-pressed hover:bg-accent-tint"
            >
              Respond →
            </a>
          )}
        </div>
        <p className="mt-0.5 text-ui text-ink-1">{row.headline}</p>
        {row.detail && (
          <p className="mt-0.5 text-caption text-ink-3">{row.detail}</p>
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
            {row.ref && (
              <span className="text-ink-4">ref: {row.ref}</span>
            )}
          </div>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
};
