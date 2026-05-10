"use client";

/**
 * Generic section wrapper for the credit memo.
 *
 * Renders a section number + eyebrow + serif H2 + grounding badge + body,
 * wraps everything in the per-section <CitationProvider>, and prints the
 * citations footer at the end. Each section is given an `id` so the
 * sticky TOC can scroll-spy and smooth-scroll to it.
 *
 * Grounding visibility:
 *   - Header badge: ✓ grounded (≥1 citation), ⚠ partial (claim count ≈
 *     citation count), ✗ ungrounded (zero citations)
 *   - Footer: ungrounded sections get an explicit warning block with an
 *     "Add citation" affordance instead of silently rendering nothing.
 *
 * Vertical rhythm: 32px top padding above the eyebrow, hairline rule
 * between sections, 48px bottom padding under the citations footer.
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/ui";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { CitationProvider, useCitations } from "./citation-context";
import { CitationsFooter } from "./citations-footer";
import { useMemoEdit } from "./memo-edit-context";
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
        "scroll-mt-[120px] border-t border-border first:border-t-0 py-10",
        className,
      )}
    >
      <CitationProvider prefill={prefillCitations}>
        <SectionInner
          sectionKey={id}
          number={number}
          eyebrow={eyebrow}
          title={title}
          kicker={kicker}
        >
          {children}
        </SectionInner>
      </CitationProvider>
    </section>
  );
};

interface InnerProps {
  sectionKey: string;
  number: number | string;
  eyebrow?: string;
  title: string;
  kicker?: React.ReactNode;
  children: React.ReactNode;
}

/** Rendered inside the CitationProvider so we can read the live count. */
const SectionInner: React.FC<InnerProps> = ({
  sectionKey,
  number,
  eyebrow,
  title,
  kicker,
  children,
}) => {
  const { list } = useCitations();
  const citationCount = list().length;
  const grounded = citationCount > 0;
  const { onEditSection } = useMemoEdit();
  const editable = !!onEditSection;
  const onEdit = onEditSection ? () => onEditSection(sectionKey) : undefined;

  return (
    <>
      <header className="mb-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
          <span>{`§${number}`}</span>
          {eyebrow && <span className="text-muted-foreground"> · {eyebrow}</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-h2 font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <GroundingBadge grounded={grounded} count={citationCount} />
            {kicker}
            {editable && onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md border border-border bg-paper px-2 py-1 text-mono-sm font-mono text-ink-3 hover:border-accent hover:text-accent"
                title="Edit this section"
                aria-label={`Edit ${title}`}
              >
                Edit
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <SectionErrorBoundary label={title}>
        <div className="memo-body font-serif text-body text-foreground leading-[1.55] [&>p]:mb-4 [&>p:last-child]:mb-0">
          {children}
        </div>
      </SectionErrorBoundary>
      {grounded ? (
        <CitationsFooter />
      ) : (
        <UngroundedWarning onEdit={editable ? onEdit : undefined} />
      )}
    </>
  );
};

/** Status pill — clearly distinguishes grounded vs ungrounded sections. */
const GroundingBadge: React.FC<{ grounded: boolean; count: number }> = ({
  grounded,
  count,
}) => {
  if (grounded) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-mono-sm font-mono text-emerald-800 ring-1 ring-emerald-200"
        title={`${count} citation${count === 1 ? "" : "s"} support this section`}
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        Grounded · {count}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-mono-sm font-mono text-amber-800 ring-1 ring-amber-300"
      title="No source citations — claims in this section are not yet anchored to a document page"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Ungrounded
    </span>
  );
};

/** Footer block shown when the section emitted zero citations. */
const UngroundedWarning: React.FC<{ onEdit?: () => void }> = ({ onEdit }) => (
  <div className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-4 text-body-sm">
    <div className="flex items-start gap-2 text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1">
        <p className="font-semi">No source citations</p>
        <p className="mt-0.5 text-body-sm leading-snug">
          This section's narrative is not anchored to any uploaded document.
          Before sign-off, attach citations that ground the claims to specific
          pages, or replace the prose with banker-authored content.
        </p>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="mt-3 rounded-md border border-amber-400 bg-paper px-2 py-1 text-mono-sm font-mono text-amber-900 hover:border-amber-600"
          >
            Edit section + add citations →
          </button>
        ) : null}
      </div>
    </div>
  </div>
);
