"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import { CitationChip } from "./CitationChip";
import type { Citation, NarrativeClaim } from "../lib/data";

export type ClaimAction = "flag" | "dispute" | "note";

export interface ClaimAnnotation {
  action: ClaimAction;
  /** Optional analyst note - only present for action === "note" */
  text?: string;
  /** ISO timestamp when the annotation was posted in this session */
  at: string;
}

export interface AnnotatedClaimProps {
  claim: NarrativeClaim;
  /** Resolved citations for this claim (parent does the lookup so the
   *  component stays pure). */
  citations: Citation[];
  /** Annotation already posted by the analyst, if any */
  annotation?: ClaimAnnotation;
  /** When the chip is clicked, the parent steers the right-rail evidence
   *  drawer. */
  onCiteSelect: (citationId: string) => void;
  selectedCitationId?: string;
  /** Inline action handlers - each is wired to one real <button>. */
  onFlag: (claimId: string) => void;
  onDispute: (claimId: string) => void;
  onNote: (claimId: string, text: string) => void;
}

const ACTION_LABEL: Record<ClaimAction, string> = {
  flag: "flagged",
  dispute: "disputed",
  note: "noted",
};

const ACTION_KIND: Record<ClaimAction, "warning" | "danger" | "info"> = {
  flag: "warning",
  dispute: "danger",
  note: "info",
};

/**
 * One claim in the SAR narrative, rendered as a paragraph with inline
 * citation chips. Under the prose, three inline action buttons let the
 * analyst flag / dispute / note the claim WITHOUT leaving the narrative.
 *
 * Pure presentation: receives a fully-shaped claim + citations + the
 * current annotation. All state lives in the parent.
 */
export const AnnotatedClaim: React.FC<AnnotatedClaimProps> = ({
  claim,
  citations,
  annotation,
  onCiteSelect,
  selectedCitationId,
  onFlag,
  onDispute,
  onNote,
}) => {
  const [noteOpen, setNoteOpen] = React.useState<boolean>(false);
  const [noteDraft, setNoteDraft] = React.useState<string>("");

  // Interleave the claim prose with the citation chips. We always render
  // the prose first, then a single inline group of chips (option C does
  // not split the prose mid-sentence - the chips ride at the end of the
  // claim, keeping the analyst's eye on the assertion).
  return (
    <article
      id={`claim-${claim.id}`}
      data-claim-id={claim.id}
      className="border-b border-rule px-4 py-3.5 last:border-b-0"
      aria-label={claim.assertion}
    >
      <p className="font-serif text-base leading-7 text-ink-1">
        {claim.prose}
        {citations.length > 0 && (
          <span className="ml-1 inline-flex flex-wrap items-baseline gap-1 align-baseline">
            {citations.map((c) => (
              <CitationChip
                key={c.id}
                citation={c}
                onSelect={onCiteSelect}
                selected={selectedCitationId === c.id}
              />
            ))}
          </span>
        )}
      </p>

      {/* Inline analyst actions - never make the analyst leave this row. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onFlag(claim.id)}
          className="rounded-sm border border-rule bg-paper px-2 py-0.5 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
          aria-pressed={annotation?.action === "flag"}
        >
          flag this
        </button>
        <button
          type="button"
          onClick={() => onDispute(claim.id)}
          className="rounded-sm border border-rule bg-paper px-2 py-0.5 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
          aria-pressed={annotation?.action === "dispute"}
        >
          dispute this
        </button>
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          aria-expanded={noteOpen}
          className="rounded-sm border border-rule bg-paper px-2 py-0.5 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
        >
          add note
        </button>
        {annotation && (
          <span className="ml-auto inline-flex items-center gap-2">
            <StatusBadge kind={ACTION_KIND[annotation.action]}>
              {ACTION_LABEL[annotation.action]}
            </StatusBadge>
            <span className="font-mono text-mono-sm text-ink-3">
              {annotation.at.substring(11, 19)}
            </span>
          </span>
        )}
      </div>

      {/* Note composer - inline, never modal. */}
      {noteOpen && (
        <div className="mt-2 flex flex-col gap-2 rounded-sm border border-rule bg-paper-2 p-2">
          <label
            htmlFor={`note-${claim.id}`}
            className="eyebrow text-ink-3"
          >
            Analyst note for this claim
          </label>
          <textarea
            id={`note-${claim.id}`}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            placeholder="What does the examiner need to know?"
            className="rounded-sm border border-rule bg-paper px-2 py-1 text-ui text-ink-1"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (noteDraft.trim()) {
                  onNote(claim.id, noteDraft.trim());
                  setNoteOpen(false);
                  setNoteDraft("");
                }
              }}
              className="rounded-sm border border-accent bg-accent-tint px-3 py-0.5 font-mono text-mono-sm text-accent-pressed hover:opacity-90"
            >
              post note
            </button>
            <button
              type="button"
              onClick={() => {
                setNoteOpen(false);
                setNoteDraft("");
              }}
              className="rounded-sm border border-rule bg-paper px-3 py-0.5 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline annotation note - rendered below the actions when posted. */}
      {annotation?.action === "note" && annotation.text && (
        <p className="mt-2 rounded-sm border-l-2 border-semantic-info bg-semantic-info-tint px-3 py-1.5 text-caption text-ink-2">
          <span className="eyebrow mr-2">note</span>
          {annotation.text}
        </p>
      )}
    </article>
  );
};
