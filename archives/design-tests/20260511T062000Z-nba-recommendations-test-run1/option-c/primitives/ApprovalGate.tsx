"use client";

import * as React from "react";

export type ApprovalDisposition = "accept" | "edit" | "reject";

export interface ApprovalRecommendation {
  /** SEND / HOLD / DECLINE */
  decision: string;
  riskBand?: string;
  rationaleSummary: string;
  approvalAuthority?: string;
  /** Set to true if this action is irrevocable (e.g. customer-visible send) */
  irrevocable?: boolean;
}

export interface ApprovalGateProps {
  caseId: string;
  recommendation: ApprovalRecommendation;
  onAccept: (caseId: string) => void;
  onEdit: (caseId: string, comment: string) => void;
  onReject: (caseId: string, comment: string) => void;
  disabled?: boolean;
}

/**
 * Human-in-the-loop gate for irrevocable actions. Per the platform's
 * "no auto-execution of irrevocable actions" rule, every send-to-customer
 * flows through this surface. The accept confirmation explicitly names
 * the irrevocable consequence.
 *
 * source: shared
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
      className="flex flex-col gap-3 rounded-md border border-rule bg-paper p-4"
    >
      <header className="flex items-center justify-between">
        <h3 className="eyebrow">Approval gate · irrevocable</h3>
        <span className="rounded-sm bg-paper-2 px-2 py-0.5 font-mono text-mono-sm font-medium text-ink-2">
          Recommendation: {recommendation.decision}
        </span>
      </header>

      <p className="text-body-sm text-ink-1">
        {recommendation.rationaleSummary}
      </p>
      {recommendation.approvalAuthority && (
        <div className="font-mono text-mono-sm text-ink-3">
          Approval authority required: {recommendation.approvalAuthority}
        </div>
      )}

      <label className="flex flex-col gap-1 text-mono-sm">
        <span className="text-ink-2">
          Comment (required for return / reject)
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          disabled={disabled}
          className="rounded-sm border border-rule bg-paper p-2 text-ui text-ink-1 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          placeholder="Reason for return or rejection…"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={requestAccept}
          disabled={disabled}
          className="rounded-sm bg-brandBlack px-4 py-2 text-ui font-semi text-brandBlack-fg hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send to customer (irrevocable)
        </button>
        <button
          type="button"
          onClick={() => {
            if (!comment.trim()) return;
            setConfirming("edit");
          }}
          disabled={disabled || !comment.trim()}
          className="rounded-sm border border-border-strong px-4 py-2 text-ui font-semi text-ink-1 hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="rounded-sm border border-semantic-danger px-4 py-2 text-ui font-semi text-semantic-danger hover:bg-semantic-dangerTint disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject
        </button>
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-label="Confirm action"
          className="mt-2 rounded-sm border border-semantic-warning bg-semantic-warningTint p-3 text-ui text-ink-1"
        >
          <div className="font-semi">
            Confirm {confirming}
            {recommendation.irrevocable && confirming === "accept"
              ? " (irrevocable)"
              : ""}
          </div>
          <div className="mt-1 text-mono-sm">
            {confirming === "accept" && recommendation.irrevocable
              ? "A customer-visible communication will be dispatched. This action cannot be undone."
              : `This will dispatch a ${confirming} disposition for ${caseId}.`}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirm}
              className="rounded-sm bg-semantic-danger px-3 py-1 text-mono-sm font-semi text-paper"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="rounded-sm border border-border-strong px-3 py-1 text-mono-sm font-semi text-ink-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
