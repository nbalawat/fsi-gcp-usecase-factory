"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import { AnnotatedClaim, type ClaimAnnotation } from "./AnnotatedClaim";
import { EvidenceDrawer } from "./EvidenceDrawer";
import {
  CITATIONS,
  SECTION_LABEL,
  SECTION_ORDER,
  citationsForClaim,
  claimsBySection,
  type ClaimSection,
} from "../lib/data";

export interface AnnotatedNarrativeProps {
  /** Caller-controlled flag - when true, the inline approval signoff
   *  block renders at the bottom of the narrative (used by the
   *  /approval/[id] route). */
  showApprovalFooter?: boolean;
  /** Render slot for the approval footer (kept outside this component
   *  so the case-detail route can hide it). */
  approvalFooter?: React.ReactNode;
}

/**
 * The full SAR narrative as an annotated document. Sections render
 * top-to-bottom; every claim carries inline citation chips that drive a
 * single right-rail EvidenceDrawer. Inline flag / dispute / note actions
 * on each claim. This is option C's design signature.
 *
 * Owns the local UI state for:
 *   - which citation chip is currently selected (drives the drawer)
 *   - per-claim annotations (flag / dispute / note)
 *
 * No business decisions, no scoring - the agent already produced the
 * claims and citations. This view is the audit surface.
 */
export const AnnotatedNarrative: React.FC<AnnotatedNarrativeProps> = ({
  showApprovalFooter = false,
  approvalFooter,
}) => {
  const sections = React.useMemo(() => claimsBySection(), []);

  const [selectedCite, setSelectedCite] = React.useState<string | null>(null);
  const [annotations, setAnnotations] = React.useState<
    Record<string, ClaimAnnotation>
  >({});

  const onCiteSelect = React.useCallback((id: string): void => {
    setSelectedCite((cur) => (cur === id ? null : id));
  }, []);

  const post = (claimId: string, ann: ClaimAnnotation): void => {
    setAnnotations((prev) => ({ ...prev, [claimId]: ann }));
  };

  const onFlag = (claimId: string): void =>
    post(claimId, { action: "flag", at: new Date().toISOString() });
  const onDispute = (claimId: string): void =>
    post(claimId, { action: "dispute", at: new Date().toISOString() });
  const onNote = (claimId: string, text: string): void =>
    post(claimId, { action: "note", text, at: new Date().toISOString() });

  const activeCitation = selectedCite ? CITATIONS[selectedCite] ?? null : null;

  // Per-section claim counts and per-section annotation counts.
  const sectionMeta: Record<
    ClaimSection,
    { total: number; annotated: number }
  > = {
    header: { total: sections.header.length, annotated: 0 },
    pattern: { total: sections.pattern.length, annotated: 0 },
    parties: { total: sections.parties.length, annotated: 0 },
    geography: { total: sections.geography.length, annotated: 0 },
    disposition: { total: sections.disposition.length, annotated: 0 },
  };
  for (const [claimId, ann] of Object.entries(annotations)) {
    if (!ann) continue;
    const sec = SECTION_ORDER.find((s) =>
      sections[s].some((c) => c.id === claimId),
    );
    if (sec) sectionMeta[sec].annotated += 1;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
      <section
        aria-label="SAR narrative"
        className="rounded-md border border-rule bg-paper"
      >
        <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
          <div>
            <div className="eyebrow">Annotated narrative</div>
            <h2 className="font-serif text-h3 font-semi text-ink-1">
              SAR draft
            </h2>
          </div>
          <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
            {Object.keys(annotations).length} of{" "}
            {SECTION_ORDER.reduce((n, s) => n + sections[s].length, 0)} claims annotated
          </span>
        </header>

        {SECTION_ORDER.map((s) => {
          const claims = sections[s];
          if (claims.length === 0) return null;
          const meta = sectionMeta[s];
          return (
            <section
              key={s}
              aria-label={SECTION_LABEL[s]}
              id={`section-${s}`}
              className="border-b border-rule last:border-b-0"
            >
              <header className="sticky top-0 z-[1] flex items-baseline justify-between gap-2 border-b border-rule bg-paper-2 px-4 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="eyebrow">{s}</span>
                  <h3 className="font-serif text-h4 font-semi text-ink-1">
                    {SECTION_LABEL[s]}
                  </h3>
                </div>
                <div className="flex items-center gap-2 font-mono text-mono-sm text-ink-3 tabular-nums">
                  <span>
                    {meta.total} {meta.total === 1 ? "claim" : "claims"}
                  </span>
                  {meta.annotated > 0 && (
                    <StatusBadge kind="info">
                      {meta.annotated} annotated
                    </StatusBadge>
                  )}
                </div>
              </header>
              <div className="flex flex-col">
                {claims.map((c) => (
                  <AnnotatedClaim
                    key={c.id}
                    claim={c}
                    citations={citationsForClaim(c)}
                    annotation={annotations[c.id]}
                    onCiteSelect={onCiteSelect}
                    selectedCitationId={selectedCite ?? undefined}
                    onFlag={onFlag}
                    onDispute={onDispute}
                    onNote={onNote}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {showApprovalFooter && approvalFooter && (
          <div className="border-t border-rule bg-paper-2 p-4">
            {approvalFooter}
          </div>
        )}
      </section>

      <EvidenceDrawer
        citation={activeCitation}
        onClose={() => setSelectedCite(null)}
      />
    </div>
  );
};
