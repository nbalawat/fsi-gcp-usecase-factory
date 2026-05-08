"use client";

/**
 * Skeleton placeholder for an individual section. Matches the rough shape of
 * the final output (eyebrow + h2 + paragraphs + a table block) so the layout
 * doesn't shift when real content lands.
 */

import * as React from "react";
import { cn } from "@/lib/ui";

interface Props {
  number: number | string;
  title: string;
  /** Number of paragraph lines to render. */
  paragraphs?: number;
  /** Whether to render a table-block placeholder underneath. */
  table?: boolean;
}

export const MemoSectionSkeleton: React.FC<Props> = ({
  number,
  title,
  paragraphs = 3,
  table = true,
}) => {
  return (
    <section
      aria-busy="true"
      aria-label={`${title} loading`}
      className="border-t border-rule first:border-t-0 py-10"
    >
      <p className="text-eyebrow uppercase tracking-[0.08em] text-ink-3 font-mono">
        {`§${number}`}
      </p>
      <h2 className="mt-1 font-serif text-h2 font-semi text-ink-3 opacity-60">
        {title}
      </h2>
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: paragraphs }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3.5 rounded-sm bg-paper-2 animate-pulse",
              i === paragraphs - 1 ? "w-2/3" : "w-full",
            )}
          />
        ))}
      </div>
      {table && (
        <div className="mt-6 rounded-md border border-rule overflow-hidden">
          <div className="h-9 bg-paper-2 border-b border-rule animate-pulse" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-10 border-b border-rule last:border-b-0 animate-pulse",
                i % 2 === 0 ? "bg-paper" : "bg-paper-2",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
};
