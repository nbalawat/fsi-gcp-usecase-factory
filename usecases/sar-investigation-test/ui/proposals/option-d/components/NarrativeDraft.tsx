import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { NarrativeBlock } from "../lib/data";

export interface NarrativeDraftProps {
  blocks: NarrativeBlock[];
  /** How many edges are currently in the selection. */
  selectionCount: number;
  /** Default-selection count from the canvas (for "reset to default" hint). */
  defaultCount: number;
}

/**
 * The SAR narrative draft. Generated from the currently-selected
 * sub-graph by `buildNarrative()` in the data adapter. Pure
 * presentation — no decisions, no math here.
 *
 * The wildcard's promise: the narrative is NOT authored separately
 * from the graph. Toggling an edge in the graph re-renders the draft.
 */
export const NarrativeDraft: React.FC<NarrativeDraftProps> = ({
  blocks,
  selectionCount,
  defaultCount,
}) => (
  <section
    aria-label="SAR narrative draft"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
      <div>
        <div className="eyebrow">Generated from selection</div>
        <h3 className="font-serif text-h3 font-semi text-ink-1">
          SAR narrative draft
        </h3>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge kind={selectionCount > 0 ? "info" : "neutral"}>
          {selectionCount} of {defaultCount} default edges in narrative
        </StatusBadge>
      </div>
    </header>
    <div className="flex flex-col gap-3 px-4 py-3">
      {blocks.map((b, i) => (
        <article key={i} className="flex flex-col gap-1">
          <h4 className="text-h4 font-semi text-ink-1">{b.heading}</h4>
          <p className="text-ui leading-relaxed text-ink-2">{b.body}</p>
          {b.edgeIndices.length > 0 && (
            <p className="font-mono text-mono-sm text-ink-3">
              refs: {b.edgeIndices.map((i) => `e${i}`).join(", ")}
            </p>
          )}
        </article>
      ))}
    </div>
  </section>
);
