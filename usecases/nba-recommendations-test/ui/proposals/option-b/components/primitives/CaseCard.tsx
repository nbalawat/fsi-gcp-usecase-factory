"use client";

import * as React from "react";

/**
 * SHARED PRIMITIVE — inlined copy of ui/packages/components/src/CaseCard.tsx
 * Source: shared. In the recommendations console it carries the narrative
 * card chrome (the queue tile is built on top of this card primitive); the
 * narrative body lives inside as children.
 */
export type RiskBand =
  | "1-pass"
  | "2-special-mention"
  | "3-substandard"
  | "4-doubtful"
  | "5-loss";

export interface CaseCardProps {
  id: string;
  customerName: string;
  /** Compact size label, e.g. "$5M LOC extension" or "Customer · $20M revenue" */
  size?: string;
  /** Urgency bucket — urgent | attention | routine */
  urgency?: "urgent" | "attention" | "routine";
  /** Type label rendered as a small badge (e.g. "Extension", "Drift") */
  typeLabel?: string;
  /** When the recommendation was drafted */
  draftedAt?: string;
  /** Card uses a soft border colored by urgency */
  emphasis?: boolean;
  /** Anchor href — every nav card has href (per ui-standards) */
  href?: string;
  /** Compact mode (one-line) vs detail (full narrative) */
  view?: "compact" | "detail";
  children?: React.ReactNode;
}

const urgencyBorder: Record<NonNullable<CaseCardProps["urgency"]>, string> = {
  urgent: "border-urgency-urgent/40 ring-1 ring-urgency-urgent/15",
  attention: "border-urgency-attention/40 ring-1 ring-urgency-attention/10",
  routine: "border-rule",
};

const urgencyDot: Record<NonNullable<CaseCardProps["urgency"]>, string> = {
  urgent: "bg-urgency-urgent",
  attention: "bg-urgency-attention",
  routine: "bg-urgency-routine",
};

export const CaseCard: React.FC<CaseCardProps> = ({
  id,
  customerName,
  size,
  urgency = "routine",
  typeLabel,
  draftedAt,
  emphasis = true,
  href,
  view = "detail",
  children,
}) => {
  const inner = (
    <article
      data-testid={`case-card-${id}`}
      data-urgency={urgency}
      className={[
        "flex w-full flex-col gap-3 rounded-md bg-paper p-4 transition",
        "border",
        emphasis ? urgencyBorder[urgency] : "border-rule",
        href ? "hover:border-accent/60" : "",
      ].join(" ")}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${urgencyDot[urgency]}`}
          title={urgency}
        />
        <span className="font-mono text-mono-sm uppercase tracking-wide text-ink-3">
          {urgency}
        </span>
        {typeLabel && (
          <span className="rounded-sm border border-rule bg-paper-2 px-1.5 py-0.5 font-mono text-mono-sm text-ink-2">
            {typeLabel}
          </span>
        )}
        {draftedAt && (
          <span className="ml-auto font-mono text-mono-sm text-ink-3">
            drafted {draftedAt}
          </span>
        )}
      </header>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-serif text-h3 font-semi text-ink-1">{customerName}</h3>
        {size && (
          <span className="font-mono text-mono-sm text-ink-3">· {size}</span>
        )}
      </div>
      {view === "detail" && children}
    </article>
  );

  return href ? (
    <a
      href={href}
      className="block rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {inner}
    </a>
  ) : (
    inner
  );
};
