"use client";

/**
 * Banner shown while the orchestrator's drafter is still writing sections.
 * Reads "Drafting Section 4 of 10 — Risk Factors…" and disappears when every
 * section has landed.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { SECTION_LABELS, type SectionKey } from "./types";

interface Props {
  /** The 1-based index currently drafting (or null if everything is done). */
  draftingIndex: number | null;
  /** Section currently drafting, used for the human-readable label. */
  draftingSection: SectionKey | null;
  /** Total expected sections (default 10). */
  total?: number;
}

export const MemoStreamingStatus: React.FC<Props> = ({
  draftingIndex,
  draftingSection,
  total = 10,
}) => {
  if (draftingIndex == null) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 flex items-center gap-3 rounded-md border border-accent/40 bg-accent-tint/40 px-4 py-2.5"
    >
      <Loader2
        aria-hidden
        className="h-4 w-4 animate-spin text-accent-pressed"
      />
      <p className="font-mono text-mono-sm text-accent-pressed">
        <span className="font-semi">
          Drafting section {draftingIndex} of {total}
        </span>
        {draftingSection && (
          <span className="text-ink-2">
            {" — "}
            {SECTION_LABELS[draftingSection]}…
          </span>
        )}
      </p>
    </div>
  );
};
