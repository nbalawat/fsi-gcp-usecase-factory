"use client";

/**
 * Citations index for a single section. Renders at the foot of every
 * <MemoSection> as a numbered list of every citation registered inline.
 *
 * Visual: a hairline-bordered block, eyebrow heading "SOURCES", per-citation
 * line "[1] Source name · page X · short claim". Mono small text.
 */

import * as React from "react";
import { useCitations } from "./citation-context";

export const CitationsFooter: React.FC = () => {
  const { list } = useCitations();
  const cites = list();
  if (cites.length === 0) return null;

  return (
    <div className="mt-8 border-t border-border pt-4">
      <p className="text-eyebrow uppercase tracking-[0.08em] text-muted-foreground">
        Sources
      </p>
      <ol className="mt-2 flex flex-col gap-1.5">
        {cites.map((c, i) => (
          <li
            key={`${c.source}-${i}`}
            className="font-mono text-mono-sm text-foreground/85 leading-snug"
          >
            <span className="text-primary font-semi mr-1.5">
              {`[${i + 1}]`}
            </span>
            <span className="text-foreground font-semi">{c.source}</span>
            {c.page != null && (
              <span className="text-muted-foreground"> · p.{c.page}</span>
            )}
            {c.section && <span className="text-muted-foreground"> · {c.section}</span>}
            <span className="text-muted-foreground"> — {c.claim}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};
