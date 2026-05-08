"use client";

/**
 * Generic section wrapper for the credit memo.
 *
 * Renders a section number + eyebrow + serif H2 + body, wraps everything in
 * the per-section <CitationProvider>, and prints the citations footer at the
 * end. Each section is given an `id` so the sticky TOC can scroll-spy and
 * smooth-scroll to it.
 *
 * Vertical rhythm: 32px top padding above the eyebrow, hairline rule between
 * sections, 48px bottom padding under the citations footer.
 */

import * as React from "react";
import { cn } from "@/lib/ui";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { CitationProvider } from "./citation-context";
import { CitationsFooter } from "./citations-footer";
import type { Citation } from "./types";

interface Props {
  id: string;
  number: number | string;
  eyebrow?: string;
  title: string;
  /** Optional kicker right of title (e.g. risk band badge). */
  kicker?: React.ReactNode;
  /** Pre-loaded citations from the section payload, used for footer fallback. */
  prefillCitations?: Citation[];
  children: React.ReactNode;
  className?: string;
}

export const MemoSection: React.FC<Props> = ({
  id,
  number,
  eyebrow,
  title,
  kicker,
  prefillCitations,
  children,
  className,
}) => {
  return (
    <section
      id={id}
      data-memo-section={id}
      className={cn(
        "scroll-mt-[120px] border-t border-rule first:border-t-0 py-10",
        className,
      )}
    >
      <CitationProvider prefill={prefillCitations}>
        <header className="mb-6">
          <p className="text-eyebrow uppercase tracking-[0.08em] text-accent-pressed font-mono">
            <span className="font-semi">{`§${number}`}</span>
            {eyebrow && <span className="text-ink-3"> · {eyebrow}</span>}
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-h2 font-semi tracking-tight text-ink-1">
              {title}
            </h2>
            {kicker && <div className="shrink-0">{kicker}</div>}
          </div>
        </header>
        <SectionErrorBoundary label={title}>
          <div className="memo-body font-serif text-body text-ink-1 leading-[1.55] [&>p]:mb-4 [&>p:last-child]:mb-0">
            {children}
          </div>
        </SectionErrorBoundary>
        <CitationsFooter />
      </CitationProvider>
    </section>
  );
};
