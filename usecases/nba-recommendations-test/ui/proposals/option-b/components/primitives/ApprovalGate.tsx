"use client";

import * as React from "react";

/**
 * SHARED PRIMITIVE — inlined copy of ui/packages/components/src/ApprovalGate.tsx
 * Source: shared. The bank's mandated HITL disposition surface. In the
 * recommendations console it backs the Accept / Edit / Defer / Reject row at
 * the bottom of every narrative card.
 *
 * Per platform rule: "no auto-execution of irrevocable actions". Accept
 * routes; never auto-executes.
 */
export type ApprovalDisposition = "accept" | "edit" | "defer" | "reject";

export interface ApprovalRecommendation {
  /** ACCEPT / EDIT / DEFER / REJECT */
  decision: string;
  /** Plain-English summary of WHAT the agent proposes (and WHY) */
  rationaleSummary: string;
  /** Where the accept will route (e.g. "RM outreach queue", "OMS") */
  routeTo?: string;
  /** Approval authority required (e.g. "RM", "Credit officer") */
  approvalAuthority?: string;
  /** Set to true if accept is irrevocable */
  irrevocable?: boolean;
}

export interface ApprovalGateProps {
  caseId: string;
  recommendation: ApprovalRecommendation;
  onAccept: (caseId: string) => void;
  onEdit: (caseId: string, comment: string) => void;
  onDefer: (caseId: string, comment: string) => void;
  onReject: (caseId: string, comment: string) => void;
  disabled?: boolean;
}

export const ApprovalGate: React.FC<ApprovalGateProps> = ({
  caseId,
  recommendation,
  onAccept,
  onEdit,
  onDefer,
  onReject,
  disabled = false,
}) => {
  const [comment, setComment] = React.useState<string>("");
  const [confirming, setConfirming] = React.useState<null | ApprovalDisposition>(null);

  const requestAccept = (): void => {
    if (recommendation.irrevocable) setConfirming("accept");
    else onAccept(caseId);
  };

  const confirm = (): void => {
    if (confirming === "accept") onAccept(caseId);
    if (confirming === "edit") onEdit(caseId, comment);
    if (confirming === "defer") onDefer(caseId, comment);
    if (confirming === "reject") onReject(caseId, comment);
    setConfirming(null);
    setComment("");
  };

  const acceptLabel =
    recommendation.routeTo
      ? `Accept & route to ${recommendation.routeTo}`
      : "Accept";

  return (
    <section
      aria-label="Approval gate"
      className="flex flex-col gap-3 rounded-md border border-rule bg-paper p-4"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-2">
          Disposition
        </h3>
        <span className="rounded bg-paper-2 px-2 py-0.5 text-xs font-semibold text-ink-2">
          Recommendation: {recommendation.decision}
        </span>
      </header>

      <p className="text-sm text-ink-1">{recommendation.rationaleSummary}</p>
      {recommendation.approvalAuthority && (
        <div className="text-xs text-ink-3">
          Approval authority: {recommendation.approvalAuthority}
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-ink-2">Comment (required for edit / defer / reject)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          disabled={disabled}
          className="rounded border border-rule bg-paper p-2 text-sm text-ink-1 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          placeholder="Why are you editing, deferring, or rejecting…"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={requestAccept}
          disabled={disabled}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {acceptLabel}
        </button>
        <button
          type="button"
          onClick={() => { if (comment.trim()) setConfirming("edit"); }}
          disabled={disabled || !comment.trim()}
          className="rounded border border-border-strong px-4 py-2 text-sm font-semibold text-ink-1 hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => { if (comment.trim()) setConfirming("defer"); }}
          disabled={disabled || !comment.trim()}
          className="rounded border border-rule px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Defer
        </button>
        <button
          type="button"
          onClick={() => { if (comment.trim()) setConfirming("reject"); }}
          disabled={disabled || !comment.trim()}
          className="rounded border border-semantic-danger/60 px-4 py-2 text-sm font-semibold text-semantic-danger hover:bg-semantic-dangerTint disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject
        </button>
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-label="Confirm action"
          className="mt-2 rounded border border-semantic-warning/60 bg-semantic-warningTint p-3 text-sm text-ink-1"
        >
          <div className="font-semibold">
            Confirm {confirming}
            {recommendation.irrevocable && confirming === "accept"
              ? " (irrevocable)"
              : ""}
          </div>
          <div className="mt-1 text-xs">
            {confirming === "accept" && recommendation.irrevocable
              ? `Routing to ${recommendation.routeTo ?? "downstream"} is irrevocable.`
              : `This will dispatch a ${confirming} disposition for ${caseId}.`}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirm}
              className="rounded bg-semantic-danger px-3 py-1 text-xs font-semibold text-paper"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="rounded border border-border-strong px-3 py-1 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
