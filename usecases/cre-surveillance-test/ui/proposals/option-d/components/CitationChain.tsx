import * as React from "react";
import type { Citation } from "../lib/data";

export interface CitationChainProps {
  citations: readonly Citation[];
  /** Show the authority label next to each citation chip. */
  showAuthority?: boolean;
}

/**
 * Inline citation chain — renders the OCC / FRB / bank-policy /
 * loan-agreement references attached to an event or threshold. This is
 * the visual signature of the regulator-audit-first view: every claim
 * carries its source, inline, in the same monospaced "page reference"
 * style used in supervisory exam reports.
 *
 * Server component (display only).
 */
export const CitationChain: React.FC<CitationChainProps> = ({
  citations,
  showAuthority = false,
}) => {
  if (citations.length === 0) {
    return (
      <span className="font-mono text-mono-sm text-ink-4">
        no citations on file
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {citations.map((c, i) => (
        <span key={`${c.id}-${i}`} className="cite" title={c.title}>
          {c.id}
          {showAuthority && (
            <span className="ml-1 text-ink-4">· {c.authority}</span>
          )}
        </span>
      ))}
    </span>
  );
};
