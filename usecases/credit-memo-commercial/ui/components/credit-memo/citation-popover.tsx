"use client";

/**
 * Floating popover for a single citation. Shown when the user clicks (or
 * Tab-and-Enters) a <CitationSuperscript>. Renders the source name, page +
 * section, the excerpt (truncated to 280 chars with show-more toggle), the
 * claim it supports, and a "view in source" affordance (currently disabled —
 * a future doc viewer route will hook into `url`).
 */

import * as React from "react";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/ui";
import type { Citation } from "./types";

const TRUNC = 280;

interface Props {
  citation: Citation;
  index: number;
  onClose: () => void;
}

export const CitationPopover: React.FC<Props> = ({
  citation,
  index,
  onClose,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const excerpt = citation.excerpt ?? "";
  const truncated = excerpt.length > TRUNC && !expanded;
  const display = truncated ? `${excerpt.slice(0, TRUNC)}…` : excerpt;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Citation ${index}: ${citation.source}`}
      className={cn(
        "absolute z-50 w-[360px] rounded-md border border-rule bg-paper p-4 shadow-pop",
        "left-1/2 -translate-x-1/2 top-full mt-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-mono-sm font-semi text-accent-pressed">
            {`[${index}]`}
          </span>
          <p className="font-mono text-mono-sm font-semi text-ink-1 break-words">
            {citation.source}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close citation"
          className="rounded-sm p-0.5 text-ink-3 hover:bg-paper-2 hover:text-ink-1"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-1 font-mono text-mono-sm text-ink-3">
        {citation.page != null ? `Page ${citation.page}` : "Page —"}
        {citation.section ? ` · ${citation.section}` : ""}
        {citation.kind ? ` · ${citation.kind.replace(/_/g, " ")}` : ""}
      </p>

      {excerpt && (
        <blockquote className="mt-3 border-l-2 border-accent pl-3 font-serif text-body-sm text-ink-2 leading-snug">
          {display}
          {truncated && (
            <button
              type="button"
              className="ml-1 text-accent-pressed underline-offset-2 hover:underline"
              onClick={() => setExpanded(true)}
            >
              show more
            </button>
          )}
        </blockquote>
      )}

      <div className="mt-3 border-t border-rule pt-2">
        <p className="text-mono-sm font-mono uppercase tracking-[0.06em] text-ink-3">
          Supports claim
        </p>
        <p className="mt-1 text-body-sm text-ink-2">{citation.claim}</p>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 text-body-sm text-ink-3 hover:text-ink-2 disabled:opacity-60"
          aria-label="Open source document (not yet available)"
          title="Doc viewer coming soon"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View in source
        </button>
      </div>
    </div>
  );
};
