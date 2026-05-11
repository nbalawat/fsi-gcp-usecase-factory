"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { GateState } from "../lib/data";
import { CitationChain } from "./CitationChain";

export interface ReserveBookingClientProps {
  caseId: string;
  facilityTitle: string;
  /** The HITL gate being responded to. */
  gate: GateState;
  /** Pre-shaped recommendation summary the auditor sent over. */
  recommendation: {
    decision: string;
    rationaleSummary: string;
    approvalAuthority?: string;
    proposedReserveUsd?: number;
    methodology?: string;
  };
}

/**
 * Reserve-booking surface, framed as an examiner's "supervisory finding"
 * with an irrevocable confirmation. The flow:
 *
 *   1. Reviewer reads the recommendation, the methodology, the citation
 *      chain that explains why the auditor proposed a reserve.
 *   2. Reviewer either:
 *      a. Approves → IRREVOCABLE (GL posting initiated, ALLL adjusted).
 *      b. Returns for revision (comment required).
 *      c. Rejects (comment required).
 *   3. The action is queued via an inert button — this is a mock; the
 *      production HITL gate posts to the workflow callback.
 *
 * Client component because of useState + confirmation modal.
 */
export const ReserveBookingClient: React.FC<ReserveBookingClientProps> = ({
  caseId,
  facilityTitle,
  gate,
  recommendation,
}) => {
  const [comment, setComment] = React.useState<string>("");
  const [confirming, setConfirming] = React.useState<
    null | "accept" | "return" | "reject"
  >(null);
  const [disposed, setDisposed] = React.useState<
    null | "accept" | "return" | "reject"
  >(null);

  const proposedReserve = recommendation.proposedReserveUsd ?? 0;
  const formattedReserve = proposedReserve.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const requestAccept = (): void => {
    if (gate.irrevocable) {
      setConfirming("accept");
    } else {
      setDisposed("accept");
    }
  };

  const confirm = (): void => {
    if (confirming) setDisposed(confirming);
    setConfirming(null);
  };

  if (disposed) {
    return (
      <section className="rounded-md border border-rule bg-paper p-5">
        <div className="eyebrow">Disposition recorded</div>
        <h3 className="mt-1 font-serif text-h3 font-semi text-ink-1">
          {gate.label} → {disposed}
        </h3>
        <p className="mt-2 text-body-sm text-ink-3">
          The audit trail has been updated for facility{" "}
          <span className="font-mono">{caseId}</span>. In production this
          would trigger the workflow callback and (if accepted) the GL
          posting.
        </p>
        {comment && (
          <div className="mt-3 rounded-sm border border-rule bg-paper-2 p-3">
            <div className="eyebrow mb-1">Reviewer note</div>
            <p className="text-body-sm text-ink-2">{comment}</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Reserve booking flow"
      className="flex flex-col gap-4 rounded-md border border-rule bg-paper p-5"
    >
      <header className="border-b border-rule pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="eyebrow">Supervisory finding</div>
            <h3 className="font-serif text-h3 font-semi text-ink-1">
              {gate.label}
            </h3>
            <p className="mt-1 text-body-sm text-ink-3">{facilityTitle}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge kind={gate.irrevocable ? "danger" : "warning"}>
              {gate.irrevocable ? "Irrevocable" : "Reversible"}
            </StatusBadge>
            <span className="font-mono text-mono-sm text-ink-3">
              {gate.status}
            </span>
          </div>
        </div>
      </header>

      <div>
        <div className="eyebrow mb-1">Auditor recommendation</div>
        <div className="rounded-sm border border-rule bg-paper-2 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-mono text-mono font-semi text-ink-1">
              {recommendation.decision}
            </span>
            {proposedReserve > 0 && (
              <span className="font-serif text-h3 font-semi text-ink-1">
                {formattedReserve}
              </span>
            )}
          </div>
          <p className="mt-2 text-body-sm text-ink-2">
            {recommendation.rationaleSummary}
          </p>
          {recommendation.methodology && (
            <p className="mt-2 text-body-sm text-ink-3">
              <span className="eyebrow mr-1">Methodology</span>
              {recommendation.methodology}
            </p>
          )}
          {recommendation.approvalAuthority && (
            <p className="mt-2 text-body-sm text-ink-3">
              <span className="eyebrow mr-1">Approval authority</span>
              {recommendation.approvalAuthority}
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="eyebrow mb-1">Citation chain</div>
        <CitationChain citations={gate.citations} showAuthority />
      </div>

      <label className="flex flex-col gap-1 text-mono-sm">
        <span className="eyebrow">Reviewer note (required for return / reject)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="rounded-sm border border-rule bg-paper p-2 font-sans text-ui text-ink-1 focus:border-accent focus:outline-none"
          placeholder="Reason for return or rejection — cite the policy section if applicable…"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={requestAccept}
          className="rounded-sm bg-accent px-4 py-2 text-ui font-medium text-ink-1 hover:bg-accent-hover"
        >
          {gate.irrevocable ? "Approve & book reserve" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!comment.trim()) return;
            setConfirming("return");
          }}
          disabled={!comment.trim()}
          className="rounded-sm border border-border px-4 py-2 text-ui font-medium text-ink-1 hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Return for revision
        </button>
        <button
          type="button"
          onClick={() => {
            if (!comment.trim()) return;
            setConfirming("reject");
          }}
          disabled={!comment.trim()}
          className="rounded-sm border border-semantic-danger px-4 py-2 text-ui font-medium text-semantic-danger hover:bg-semantic-dangerTint disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject finding
        </button>
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-label="Confirm action"
          className="rounded-sm border border-semantic-warning bg-semantic-warningTint p-3"
        >
          <div className="font-serif text-h4 font-semi text-ink-1">
            Confirm {confirming}
            {gate.irrevocable && confirming === "accept"
              ? " — IRREVOCABLE"
              : ""}
          </div>
          <div className="mt-1 text-body-sm text-ink-2">
            {confirming === "accept" && gate.irrevocable
              ? `A specific reserve of ${formattedReserve} will be booked to the ALLL ledger for facility ${caseId}. This action cannot be undone.`
              : `This will dispatch a ${confirming} disposition for facility ${caseId}.`}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirm}
              className="rounded-sm bg-semantic-danger px-3 py-1 text-mono-sm font-medium text-paper"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="rounded-sm border border-border px-3 py-1 text-mono-sm font-medium text-ink-1 hover:bg-paper-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
