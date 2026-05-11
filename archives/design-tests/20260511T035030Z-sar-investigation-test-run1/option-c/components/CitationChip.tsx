"use client";

import * as React from "react";
import type { Citation } from "../lib/data";

const KIND_GLYPH: Record<Citation["kind"], string> = {
  transaction: "TXN",
  account:     "ACC",
  geography:   "GEO",
  agent:       "AGT",
  rule:        "RUL",
  service:     "SVC",
};

export interface CitationChipProps {
  citation: Citation;
  /** Called when the chip is toggled - the parent uses this to drive the
   *  side-rail evidence drawer. If undefined, the chip toggles a local
   *  inline popover instead. */
  onSelect?: (id: string) => void;
  /** Driven by the parent when a drawer is open - reflects current state
   *  in the chip's aria-expanded + visual ring. */
  selected?: boolean;
}

/**
 * The signature affordance of option C: a tight, mono "cite source" chip
 * rendered INLINE inside the claim's prose. Clicking it either:
 *   - bubbles up to the parent (preferred - drives the evidence drawer
 *     on the right rail so the eye never leaves the narrative line), or
 *   - falls back to a local popover under the chip when no handler is
 *     wired.
 *
 * Real <button> with an onClick handler (auditor rule). aria-expanded
 * reflects state so screen readers can announce open/close.
 */
export const CitationChip: React.FC<CitationChipProps> = ({
  citation,
  onSelect,
  selected,
}) => {
  const [open, setOpen] = React.useState<boolean>(false);
  const isControlled = typeof onSelect === "function";
  const isOpen = isControlled ? Boolean(selected) : open;

  const handleClick = (): void => {
    if (isControlled && onSelect) {
      onSelect(citation.id);
    } else {
      setOpen((v) => !v);
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={isOpen}
        aria-controls={`cite-${citation.id}`}
        title={citation.title}
        className="cite-chip"
        data-citation-id={citation.id}
        data-citation-kind={citation.kind}
      >
        <span
          aria-hidden
          className="font-mono text-[9px] uppercase tracking-wider text-ink-3"
        >
          {KIND_GLYPH[citation.kind]}
        </span>
        <span>{citation.label}</span>
      </button>
      {!isControlled && open && (
        <span
          role="dialog"
          id={`cite-${citation.id}`}
          aria-label={`Evidence: ${citation.title}`}
          className="absolute left-0 top-full z-10 mt-1 w-80 rounded-md border border-rule bg-paper p-3 shadow-lg"
        >
          <span className="block font-mono text-[10px] uppercase tracking-wide text-ink-3">
            {citation.kind} - {citation.label}
          </span>
          <span className="mt-0.5 block text-ui font-semibold text-ink-1">
            {citation.title}
          </span>
          <span className="mt-1 block text-caption text-ink-2">
            {citation.body}
          </span>
        </span>
      )}
    </span>
  );
};
