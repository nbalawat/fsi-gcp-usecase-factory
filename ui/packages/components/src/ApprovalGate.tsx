"use client";

import * as React from "react";

export type ApprovalDisposition = "accept" | "edit" | "reject";

export interface ApprovalRecommendation {
  /** APPROVE / DECLINE / RETURN_FOR_REVISION */
  decision: string;
  riskBand?: string;
  rationaleSummary: string;
  approvalAuthority?: string;
  /** Set to true if this action is irrevocable (e.g. GL posting) */
  irrevocable?: boolean;
}

export interface ApprovalGateProps {
  caseId: string;
  recommendation: ApprovalRecommendation;
  onAccept: (caseId: string) => void;
  onEdit: (caseId: string, comment: string) => void;
  onReject: (caseId: string, comment: string) => void;
  /** Disable buttons (e.g. case is not in approval stage) */
  disabled?: boolean;
}

/**
 * Human-in-the-loop gate. Per the platform's "no auto-execution of
 * irrevocable actions" rule, every approval flows through this surface.
 */
export const ApprovalGate: React.FC<ApprovalGateProps> = ({
  caseId,
  recommendation,
  onAccept,
  onEdit,
  onReject,
  disabled = false,
}) => {
  const [comment, setComment] = React.useState<string>("");
  const [confirming, setConfirming] = React.useState<
    null | "accept" | "edit" | "reject"
  >(null);

  const requestAccept = (): void => {
    if (recommendation.irrevocable) {
      setConfirming("accept");
    } else {
      onAccept(caseId);
    }
  };

  const confirm = (): void => {
    if (confirming === "accept") onAccept(caseId);
    if (confirming === "edit") onEdit(caseId, comment);
    if (confirming === "reject") onReject(caseId, comment);
    setConfirming(null);
    setComment("");
  };

  return (
    <section
      aria-label="Approval gate"
      className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-panel p-4"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Approval gate
        </h3>
        <span className="rounded bg-surface-panelMuted px-2 py-0.5 text-xs font-semibold text-text-secondary">
          Recommendation: {recommendation.decision}
        </span>
      </header>

      <p className="text-sm text-text-primary">
        {recommendation.rationaleSummary}
      </p>
      {recommendation.approvalAuthority && (
        <div className="text-xs text-text-muted">
          Approval authority required: {recommendation.approvalAuthority}
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">
          Comment (required for return / reject)
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          disabled={disabled}
          className="rounded border border-surface-border bg-surface-canvas p-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-60"
          placeholder="Reason for return or rejection…"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={requestAccept}
          disabled={disabled}
          className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-brand-primaryDark disabled:cursor-not-allowed disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => {
            if (!comment.trim()) return;
            setConfirming("edit");
          }}
          disabled={disabled || !comment.trim()}
          className="rounded border border-surface-borderStrong px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-panelMuted disabled:cursor-not-allowed disabled:opacity-60"
        >
          Return for revision
        </button>
        <button
          type="button"
          onClick={() => {
            if (!comment.trim()) return;
            setConfirming("reject");
          }}
          disabled={disabled || !comment.trim()}
          className="rounded border border-status-critical/60 px-4 py-2 text-sm font-semibold text-status-critical hover:bg-status-criticalBg disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject
        </button>
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-label="Confirm action"
          className="mt-2 rounded border border-status-warning/60 bg-status-warningBg p-3 text-sm text-text-primary"
        >
          <div className="font-semibold">
            Confirm {confirming}
            {recommendation.irrevocable && confirming === "accept"
              ? " (irrevocable)"
              : ""}
          </div>
          <div className="mt-1 text-xs">
            {confirming === "accept" && recommendation.irrevocable
              ? "GL posting will be initiated. This action cannot be undone."
              : `This will dispatch a ${confirming} disposition for ${caseId}.`}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirm}
              className="rounded bg-status-critical px-3 py-1 text-xs font-semibold text-text-inverse"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="rounded border border-surface-borderStrong px-3 py-1 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
