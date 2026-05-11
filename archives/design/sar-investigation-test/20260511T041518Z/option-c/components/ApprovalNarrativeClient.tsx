"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { AnnotatedNarrative } from "./AnnotatedNarrative";
import type { GateState } from "../lib/data";

export interface ApprovalNarrativeClientProps {
  caseId: string;
  /** The (single) HITL gate for the SAR use case - final_approval. */
  gate: GateState;
  /** Pre-shaped recommendation - components must not compute decisions. */
  recommendation: ApprovalRecommendation;
}

/**
 * The approval surface for option C: the analyst reads the same
 * annotated narrative they read on /case/[id], and the ApprovalGate
 * primitive lives INLINE at the bottom. The approval surface IS the
 * narrative; there is no separate "review then approve" hop.
 *
 * Hosts the post-disposition state locally so the page can reflect
 * accept / return / reject without a server roundtrip in the demo.
 */
export const ApprovalNarrativeClient: React.FC<ApprovalNarrativeClientProps> = ({
  caseId,
  gate,
  recommendation,
}) => {
  const [posted, setPosted] = React.useState<
    null | { disposition: string; comment?: string }
  >(null);

  const accept = (id: string): void => {
    setPosted({ disposition: "accepted" });
    // eslint-disable-next-line no-console
    console.info("[option-c] accept", { case: id, gate: gate.id });
  };
  const edit = (id: string, comment: string): void => {
    setPosted({ disposition: "returned", comment });
    // eslint-disable-next-line no-console
    console.info("[option-c] return", { case: id, gate: gate.id, comment });
  };
  const reject = (id: string, comment: string): void => {
    setPosted({ disposition: "rejected", comment });
    // eslint-disable-next-line no-console
    console.info("[option-c] reject", { case: id, gate: gate.id, comment });
  };

  // Footer slot - rendered at the bottom of the narrative card so the
  // analyst signs off WITHOUT leaving the narrative they just read.
  const footer = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="eyebrow">{gate.id}</div>
          <h3 className="font-serif text-h4 font-semi text-ink-1">
            {gate.label}
          </h3>
        </div>
        <StatusBadge
          kind={
            gate.status === "completed"
              ? "success"
              : gate.status === "pending"
                ? "warning"
                : "neutral"
          }
        >
          {gate.status}
        </StatusBadge>
      </div>

      {gate.status === "completed" ? (
        <section
          aria-label="Gate already decided"
          className="rounded-md border border-rule bg-paper p-4"
        >
          <p className="text-ui text-ink-2">
            This SAR filing was approved{" "}
            <span className="font-mono text-mono-sm text-ink-3">
              {gate.decidedAt ?? ""}
            </span>
            . The 30-day clock starts on the same timestamp; reopen
            requires a new review event.
          </p>
        </section>
      ) : posted ? (
        <section
          aria-label="Disposition posted"
          className="rounded-md border border-semantic-success/60 bg-semantic-success-tint p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-h4 font-semi text-ink-1">
              {gate.label} -&gt; {posted.disposition}
            </h3>
            <StatusBadge kind="success">posted</StatusBadge>
          </div>
          {posted.comment && (
            <p className="mt-2 text-ui text-ink-2">
              <span className="eyebrow mr-2">comment</span>
              {posted.comment}
            </p>
          )}
          <p className="mt-2 font-mono text-mono-sm text-ink-3">
            A new event will land on the case spine of {caseId} once the
            workflow confirms.
          </p>
        </section>
      ) : (
        <ApprovalGate
          caseId={caseId}
          recommendation={recommendation}
          onAccept={accept}
          onEdit={edit}
          onReject={reject}
        />
      )}
    </div>
  );

  return (
    <AnnotatedNarrative showApprovalFooter approvalFooter={footer} />
  );
};
