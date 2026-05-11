import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { RawEvt } from "../lib/data";
import { hitlLabel } from "../lib/data";

function clockOf(iso: string): string {
  return iso.substring(11, 19);
}

const KIND_LABEL: Record<string, { icon: string; tone: string; label: string }> = {
  document_uploaded:    { icon: "↑", tone: "text-ink-2",                            label: "uploaded" },
  document_extracted:   { icon: "▢", tone: "text-accent-pressed",                   label: "extracted" },
  service_invoked:      { icon: "▢", tone: "text-accent-pressed",                   label: "service" },
  agent_invoked:        { icon: "◆", tone: "text-semantic-info",                    label: "agent" },
  human_action_pending: { icon: "▮", tone: "text-semantic-warning",                 label: "gate pending" },
  human_action:         { icon: "◉", tone: "text-semantic-success",                 label: "human" },
  stage_entered:        { icon: "·", tone: "text-ink-3",                            label: "stage" },
};

const decisionTone = (
  d?: string,
): "success" | "warning" | "danger" | "neutral" => {
  if (d === "approve" || d === "accept") return "success";
  if (d === "return" || d === "return_for_revision") return "warning";
  if (d === "reject" || d === "decline") return "danger";
  return "neutral";
};

function eventHeadline(e: RawEvt): string {
  switch (e.kind) {
    case "document_uploaded":    return `Uploaded ${e.doc_type ?? "document"}`;
    case "document_extracted":   return `Extracted ${e.doc_type ?? "document"}`;
    case "service_invoked":      return `Ran ${e.service ?? "service"}`;
    case "agent_invoked":        return `${e.agent ?? "agent"} reasoned`;
    case "human_action_pending": return `${hitlLabel(e.gate ?? "")} requested`;
    case "human_action":         return `${hitlLabel(e.gate ?? "")} → ${e.decision ?? "decided"}`;
    case "stage_entered":        return `Entered stage "${e.stage ?? ""}"`;
    default:                     return e.kind;
  }
}

export interface StageEventListProps {
  events: readonly RawEvt[];
  /** If true, show full events. If false, render the compact "rail"
   *  variant — used inside the prior-stages left rail. */
  compact?: boolean;
  emptyLabel?: string;
}

/**
 * Vertical list of events inside one stage bucket. Pure presentation —
 * receives the bucket's events from the adapter. No business logic, no
 * decisions, no math.
 */
export const StageEventList: React.FC<StageEventListProps> = ({
  events,
  compact = false,
  emptyLabel,
}) => {
  if (events.length === 0) {
    return (
      <p className="px-4 py-3 text-caption text-ink-3">
        {emptyLabel ?? "No events fired in this stage yet."}
      </p>
    );
  }
  return (
    <ol className="flex flex-col">
      {events.map((e, i) => {
        const meta = KIND_LABEL[e.kind] ?? {
          icon: "·",
          tone: "text-ink-3",
          label: e.kind,
        };
        return (
          <li
            key={`${e.at}-${i}`}
            data-kind={e.kind}
            className={`flex items-baseline gap-3 border-b border-rule px-4 last:border-b-0 ${compact ? "py-1.5" : "py-2.5"}`}
          >
            <span
              aria-hidden
              className={`font-mono text-sm ${meta.tone} flex-shrink-0`}
            >
              {meta.icon}
            </span>
            <span className="font-mono text-mono-sm text-ink-3 tabular-nums flex-shrink-0">
              {clockOf(e.at)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`text-ui ${compact ? "text-ink-2" : "text-ink-1"}`}>
                  {eventHeadline(e)}
                </span>
                {e.decision && (
                  <StatusBadge kind={decisionTone(e.decision)}>
                    {e.decision}
                  </StatusBadge>
                )}
              </div>
              {!compact && (
                <div className="mt-0.5 flex flex-wrap gap-3 font-mono text-mono-sm text-ink-3">
                  {e.latency_ms !== undefined && <span>{e.latency_ms}ms</span>}
                  {e.tokens_in !== undefined && <span>{`↑ ${e.tokens_in}t`}</span>}
                  {e.tokens_out !== undefined && <span>{`↓ ${e.tokens_out}t`}</span>}
                  {e.confidence !== undefined && (
                    <span>conf {Math.round(e.confidence * 100)}%</span>
                  )}
                  {e.service && <span className="text-ink-4">svc: {e.service}</span>}
                  {e.agent && <span className="text-ink-4">agent: {e.agent}</span>}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
