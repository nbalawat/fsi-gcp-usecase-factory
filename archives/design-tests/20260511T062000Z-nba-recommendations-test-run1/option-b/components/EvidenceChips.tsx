import * as React from "react";
import { StatusBadge } from "./primitives";
import type { EvidenceChip } from "../lib/data";

/**
 * UC-OWNED component. Evidence + safety chips that "support the story"
 * (option-B axis). Renders as a row of StatusBadge shared primitives so
 * the visual contract stays consistent with every other console.
 */
export interface EvidenceChipsProps {
  chips: readonly EvidenceChip[];
  confidence?: number;
}

export const EvidenceChips: React.FC<EvidenceChipsProps> = ({
  chips,
  confidence,
}) => (
  <div
    role="list"
    aria-label="Evidence chips"
    className="flex flex-wrap items-center gap-2"
  >
    {confidence !== undefined && (
      <span
        role="listitem"
        className="inline-flex items-center gap-2 rounded-sm border border-rule bg-paper-2 px-2 py-0.5 font-mono text-mono-sm text-ink-2"
        title="Agent confidence"
      >
        <span className="text-ink-3">conf</span>
        <span className="tabular-nums text-ink-1 font-semibold">
          {Math.round(confidence * 100)}%
        </span>
      </span>
    )}
    {chips.map((c) => (
      <span key={c.id} role="listitem">
        <StatusBadge kind={c.tone}>{c.label}</StatusBadge>
      </span>
    ))}
  </div>
);
