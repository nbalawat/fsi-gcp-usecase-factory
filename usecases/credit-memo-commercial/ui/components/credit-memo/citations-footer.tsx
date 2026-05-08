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
    <div className="mt-8 border-t border-rule pt-4">
      <p className="text-eyebrow uppercase tracking-[0.08em] text-ink-3">
        Sources
      </p>
      <ol className="mt-2 flex flex-col gap-1.5">
        {cites.map((c, i) => (
          <li
            key={`${c.source}-${i}`}
            className="font-mono text-mono-sm text-ink-2 leading-snug"
          >
            <span className="text-accent-pressed font-semi mr-1.5">
              {`[${i + 1}]`}
            </span>
            <span className="text-ink-1 font-semi">{c.source}</span>
            {c.page != null && (
              <span className="text-ink-3"> · p.{c.page}</span>
            )}
            {c.section && <span className="text-ink-3"> · {c.section}</span>}
            <span className="text-ink-3"> — {c.claim}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};
