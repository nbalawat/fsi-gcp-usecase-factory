import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { EvidenceRow } from "../lib/data";

// Banker-readable timestamp: "08:00:09" — date is implicit (same case).
function clockOf(iso: string): string {
  if (!iso) return "—";
  return iso.substring(11, 19);
}

const kindMeta: Record<
  EvidenceRow["kind"],
  { glyph: string; tone: string; ring: string; label: string }
> = {
  stage:    { glyph: "·", tone: "bg-paper-2 text-ink-3",                              ring: "ring-rule",                  label: "stage" },
  upload:   { glyph: "▲", tone: "bg-semantic-info-tint text-semantic-info",           ring: "ring-semantic-info/40",      label: "upload" },
  extract:  { glyph: "▣", tone: "bg-accent-tint text-accent-pressed",                 ring: "ring-accent/40",             label: "extract" },
  service:  { glyph: "▢", tone: "bg-accent-tint text-accent-pressed",                 ring: "ring-accent/40",             label: "service" },
  agent:    { glyph: "◆", tone: "bg-semantic-info-tint text-semantic-info",           ring: "ring-semantic-info/40",      label: "agent" },
  rule:     { glyph: "§", tone: "bg-semantic-warning-tint text-semantic-warning",     ring: "ring-semantic-warning/40",   label: "rule" },
  decision: { glyph: "◉", tone: "bg-semantic-success-tint text-semantic-success",     ring: "ring-semantic-success/40",   label: "decision" },
};

const ruleVerdictBadge = (
  headline: string,
): "success" | "warning" | "danger" | "neutral" => {
  if (headline.endsWith("pass")) return "success";
  if (headline.endsWith("watch")) return "warning";
  if (headline.endsWith("fail")) return "danger";
  return "neutral";
};

export interface EvidenceListProps {
  rows: EvidenceRow[];
  emptyLabel?: string;
}

/**
 * Renders a section's evidence as a tight chronological list. One row =
 * one event (or one rule verdict). Pure presentation — receives
 * pre-shaped rows from the adapter; no business logic, no math.
 *
 * Server component (no interactivity). The affordance row lives on
 * `SectionAffordanceRow`, NOT here.
 */
export const EvidenceList: React.FC<EvidenceListProps> = ({
  rows,
  emptyLabel = "No activity recorded for this section yet.",
}) => {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-4 text-caption text-ink-3">{emptyLabel}</p>
    );
  }
  return (
    <ol className="flex flex-col" aria-label="Section evidence">
      {rows.map((r) => {
        const meta = kindMeta[r.kind];
        const isRule = r.kind === "rule";
        return (
          <li
            key={r.idx}
            data-evidence-idx={r.idx}
            data-kind={r.kind}
            className="flex gap-3 border-b border-rule px-4 py-2.5 last:border-b-0"
          >
            <span className="flex-shrink-0 pt-0.5 font-mono text-mono-sm tabular-nums text-ink-3 w-16">
              {clockOf(r.at)}
            </span>
            <span
              aria-hidden
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ring-1 ${meta.tone} ${meta.ring} text-xs font-semibold`}
              title={meta.label}
            >
              {meta.glyph}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-mono-sm uppercase tracking-wide text-ink-3">
                  {meta.label}
                </span>
                <span className="font-mono text-mono-sm text-ink-2 truncate">
                  {r.speaker}
                </span>
                {isRule && (
                  <StatusBadge kind={ruleVerdictBadge(r.headline)}>
                    {r.headline.split("→").pop()?.trim() ?? "verdict"}
                  </StatusBadge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-ink-1">{r.headline}</p>
              {r.detail && (
                <p className="mt-0.5 text-caption text-ink-3">{r.detail}</p>
              )}
              {r.meta && (
                <div className="mt-1 flex flex-wrap gap-3 font-mono text-mono-sm text-ink-3">
                  {r.meta.latencyMs !== undefined && (
                    <span>{r.meta.latencyMs}ms</span>
                  )}
                  {r.meta.tokensIn !== undefined && (
                    <span>tokens in {r.meta.tokensIn}</span>
                  )}
                  {r.meta.tokensOut !== undefined && (
                    <span>tokens out {r.meta.tokensOut}</span>
                  )}
                  {r.meta.confidence !== undefined && (
                    <span>conf {Math.round(r.meta.confidence * 100)}%</span>
                  )}
                  {r.ref && <span className="text-ink-4">ref: {r.ref}</span>}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
