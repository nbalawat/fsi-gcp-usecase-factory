"use client";

/**
 * Inline citation superscript — `text<sup>1</sup>`.
 *
 * Click → opens the <CitationPopover>. Hovers tilt the dwell affordance:
 * cursor pointer + accent green color. Numbering is per-section (assigned by
 * the surrounding <CitationProvider>).
 *
 * Usage:
 *   <CitationSuperscript citation={c} />
 *   "Customer concentration is moderate.<CitationSuperscript citation={c} />"
 */

import * as React from "react";
import { cn } from "@/lib/ui";
import type { Citation } from "./types";
import { useCitations } from "./citation-context";
import { CitationPopover } from "./citation-popover";

interface Props {
  citation: Citation;
  /**
   * If you already know the canonical index (e.g. you're rendering the
   * citations footer and want to label entry 3 as "[3]"), pass it directly to
   * skip registration. Default: register and use that index.
   */
  forceIndex?: number;
}

export const CitationSuperscript: React.FC<Props> = ({
  citation,
  forceIndex,
}) => {
  const { register } = useCitations();
  const idx = forceIndex ?? register(citation);
  const [open, setOpen] = React.useState(false);

  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        aria-label={`Citation ${idx}: ${citation.source}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "ml-0.5 cursor-pointer align-super font-mono text-[0.65em] font-semi leading-none",
          "text-accent-pressed hover:text-accent-hov focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-[2px] px-0.5",
        )}
      >
        {idx}
      </button>
      {open && (
        <CitationPopover
          citation={citation}
          index={idx}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
};
