"use client";

import * as React from "react";
import { ExternalLink, Quote } from "lucide-react";
import { cn } from "@/lib/ui";

export interface Citation {
  source: string;
  page?: number;
  section?: string;
  excerpt?: string;
  claim?: string;
  kind?: string;
  url?: string;
}

interface CitationListProps {
  citations: Citation[];
  /** Banker view shows the claim + source; engineer view shows kind + url. */
  variant?: "banker" | "engineer";
}

/**
 * Citation list for an agent's output. Click a citation to expand the excerpt
 * inline; the source link (if present) opens in a new tab so the banker can
 * walk back to the underlying document.
 */
export const CitationList: React.FC<CitationListProps> = ({
  citations,
  variant = "banker",
}) => {
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);

  if (!citations || citations.length === 0) {
    return (
      <p className="text-body-sm italic text-ink-3">
        No external citations attached.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-rule">
      {citations.map((c, i) => {
        const isOpen = openIdx === i;
        return (
          <li key={`${c.source}-${i}`} className="py-2.5">
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-label={`Toggle citation excerpt for ${c.source}`}
              className="group flex w-full items-start gap-2 text-left"
            >
              <Quote
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-3 group-hover:text-ink-1"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm text-ink-1">
                  {c.claim ?? c.source}
                </span>
                <span className="mt-0.5 block font-mono text-mono-sm text-ink-3">
                  {c.source}
                  {c.page ? ` · p.${c.page}` : ""}
                  {c.section ? ` · ${c.section}` : ""}
                  {variant === "engineer" && c.kind ? ` · ${c.kind}` : ""}
                </span>
              </span>
              {c.url && (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open ${c.source} in a new tab`}
                  className="text-ink-3 hover:text-accent-pressed"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </button>
            <div
              className={cn(
                "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="min-h-0">
                {c.excerpt && (
                  <blockquote className="mt-2 border-l-2 border-rule pl-3 text-caption text-ink-2">
                    &ldquo;{c.excerpt}&rdquo;
                  </blockquote>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};
