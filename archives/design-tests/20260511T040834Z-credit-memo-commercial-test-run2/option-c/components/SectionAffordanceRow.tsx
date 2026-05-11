"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";

export type SectionDisposition =
  | "approve"
  | "edit"
  | "request_revision"
  | "reject";

const DISPOSITIONS: {
  id: SectionDisposition;
  label: string;
  /** Tailwind classes for this affordance. */
  classes: string;
  /** Set to true if this disposition requires a comment before posting. */
  requiresComment: boolean;
}[] = [
  {
    id: "approve",
    label: "Approve section",
    classes:
      "bg-accent text-paper hover:bg-accent-hover focus:bg-accent-pressed",
    requiresComment: false,
  },
  {
    id: "edit",
    label: "Edit & approve",
    classes:
      "border border-accent text-accent-pressed hover:bg-accent-tint",
    requiresComment: true,
  },
  {
    id: "request_revision",
    label: "Request revision",
    classes:
      "border border-rule text-ink-1 bg-paper hover:bg-paper-2",
    requiresComment: true,
  },
  {
    id: "reject",
    label: "Reject",
    classes:
      "border border-semantic-danger text-semantic-danger hover:bg-semantic-danger-tint",
    requiresComment: true,
  },
];

export interface SectionAffordanceRowProps {
  caseId: string;
  /** Banker-readable section title — shown in the row's eyebrow. */
  sectionTitle: string;
  /** The HITL gate this section closes. */
  gateId: string;
  /** Display label for the gate (e.g. "Extraction review"). */
  gateLabel: string;
  /** Recommendation already produced upstream; rendered as guidance, not as a decision. */
  recommendation: ApprovalRecommendation;
  /** If the gate has already been decided, show that and disable inputs. */
  alreadyDecided?: { decision: string; at: string };
  /** Server-side handler hook — for now we just log + flash the result. */
  onPost?: (args: {
    caseId: string;
    gateId: string;
    disposition: SectionDisposition;
    comment?: string;
  }) => void;
}

/**
 * The inline affordance row that ends every memo section. THIS is the
 * spine of option-C — the user never leaves the section to act on it.
 *
 * Four affordances, one row, all real <button> with onClick handlers:
 *   - Approve         (irrevocable iff section is final_approval)
 *   - Edit & approve  (requires a one-line note)
 *   - Request revision (requires a reason)
 *   - Reject          (requires a reason)
 *
 * No sticky bottom bar. No modal drawer. No second view.
 *
 * Comment box appears INLINE only when the chosen disposition requires
 * one — Rule 14 "defensive UI" applied: the box never collapses the
 * other affordances, so you can always escape.
 */
export const SectionAffordanceRow: React.FC<SectionAffordanceRowProps> = ({
  caseId,
  sectionTitle,
  gateId,
  gateLabel,
  recommendation,
  alreadyDecided,
  onPost,
}) => {
  const [pending, setPending] = React.useState<SectionDisposition | null>(null);
  const [comment, setComment] = React.useState<string>("");
  const [posted, setPosted] = React.useState<{
    disposition: SectionDisposition;
    comment?: string;
  } | null>(null);
  const [confirming, setConfirming] = React.useState<boolean>(false);
  const commentRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Already-decided gate — render the recorded disposition as a settled
  // row. This is the read-mode of the affordance row.
  if (alreadyDecided) {
    return (
      <div
        data-affordance="settled"
        className="flex flex-wrap items-baseline justify-between gap-3 border-t-2 border-accent bg-paper-2 px-4 py-3"
      >
        <div>
          <div className="eyebrow">{sectionTitle} · decision recorded</div>
          <p className="mt-0.5 text-sm text-ink-1">
            {gateLabel} closed with <strong>{alreadyDecided.decision}</strong>{" "}
            at {alreadyDecided.at.substring(11, 19)} UTC.
          </p>
        </div>
        <StatusBadge
          kind={alreadyDecided.decision === "approve" ? "success" : "neutral"}
        >
          {alreadyDecided.decision}
        </StatusBadge>
      </div>
    );
  }

  // Posted-locally flash (the disposition has been sent; awaiting the
  // workflow to confirm and emit a new transcript row).
  if (posted) {
    return (
      <div
        data-affordance="posted"
        className="border-t-2 border-accent bg-semantic-success-tint px-4 py-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="eyebrow">{sectionTitle} · disposition posted</div>
            <p className="mt-0.5 text-sm text-ink-1">
              {gateLabel}{" "}
              <span className="font-mono">{posted.disposition}</span>
              {posted.comment ? " with reviewer note" : ""}
            </p>
          </div>
          <StatusBadge kind="success">posted</StatusBadge>
        </div>
        {posted.comment && (
          <p className="mt-2 text-caption text-ink-2">
            <span className="eyebrow mr-2">comment</span>
            {posted.comment}
          </p>
        )}
        <p className="mt-2 font-mono text-mono-sm text-ink-3">
          The workflow will append a new evidence row to this section
          once accepted.
        </p>
      </div>
    );
  }

  const pendingDef =
    pending !== null ? DISPOSITIONS.find((d) => d.id === pending) : null;

  const requestPost = (id: SectionDisposition): void => {
    const def = DISPOSITIONS.find((d) => d.id === id);
    if (!def) return;
    if (def.requiresComment) {
      setPending(id);
      // Focus the textarea on next paint.
      setTimeout(() => commentRef.current?.focus(), 0);
      return;
    }
    // Approve flow — irrevocable iff the gate is final_approval.
    if (recommendation.irrevocable) {
      setPending(id);
      setConfirming(true);
      return;
    }
    handlePost(id, undefined);
  };

  const handlePost = (
    id: SectionDisposition,
    note: string | undefined,
  ): void => {
    setPosted({ disposition: id, comment: note });
    setPending(null);
    setComment("");
    setConfirming(false);
    onPost?.({ caseId, gateId, disposition: id, comment: note });
  };

  const cancelPending = (): void => {
    setPending(null);
    setComment("");
    setConfirming(false);
  };

  return (
    <div
      data-affordance="active"
      data-gate={gateId}
      className="border-t-2 border-accent bg-paper px-4 py-4"
    >
      {/* Recommendation strap — the agent's suggestion, NOT a decision. */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
        <div className="min-w-0">
          <div className="eyebrow">{sectionTitle} · awaiting disposition</div>
          <p className="mt-0.5 text-sm text-ink-1">
            <span className="font-mono text-mono-sm text-ink-3">
              {gateLabel}
            </span>{" "}
            — {recommendation.rationaleSummary}
          </p>
          {recommendation.approvalAuthority && (
            <p className="mt-1 font-mono text-mono-sm text-ink-3">
              authority: {recommendation.approvalAuthority}
            </p>
          )}
        </div>
        <StatusBadge kind="warning">awaiting</StatusBadge>
      </div>

      {/* The four affordances, side-by-side. */}
      <div
        role="group"
        aria-label={`Disposition affordances for ${gateLabel}`}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        {DISPOSITIONS.map((d) => {
          const isPending = pending === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => requestPost(d.id)}
              disabled={pending !== null && !isPending}
              aria-pressed={isPending}
              data-disposition={d.id}
              className={`rounded-sm px-3 py-1.5 font-mono text-mono-sm transition disabled:opacity-50 ${d.classes}`}
            >
              {d.label}
            </button>
          );
        })}
        {recommendation.irrevocable && (
          <span className="ml-2 font-mono text-mono-sm text-semantic-danger">
            irrevocable · GL post
          </span>
        )}
      </div>

      {/* Comment-required state — textarea + confirm/cancel buttons. */}
      {pending && pendingDef && pendingDef.requiresComment && (
        <div className="mt-3 rounded-sm border border-rule bg-paper-2 p-3">
          <label
            htmlFor={`comment-${gateId}`}
            className="eyebrow block"
          >
            Reviewer note ({pendingDef.label.toLowerCase()})
          </label>
          <textarea
            ref={commentRef}
            id={`comment-${gateId}`}
            value={comment}
            onChange={(ev) => setComment(ev.target.value)}
            rows={3}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-2 py-1.5 text-sm text-ink-1 focus:border-accent focus:outline-none"
            placeholder={
              pending === "edit"
                ? "What did you change before approving?"
                : pending === "request_revision"
                  ? "What needs to be revised before this section can close?"
                  : "Reason for rejection (recorded in audit trail)"
            }
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelPending}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handlePost(pending, comment)}
              disabled={comment.trim().length === 0}
              className="rounded-sm bg-accent px-3 py-1 font-mono text-mono-sm text-paper hover:bg-accent-hover disabled:opacity-50"
            >
              Post {pendingDef.label.toLowerCase()}
            </button>
          </div>
        </div>
      )}

      {/* Irrevocable-approve confirm strap. */}
      {pending === "approve" && confirming && recommendation.irrevocable && (
        <div className="mt-3 rounded-sm border border-semantic-danger bg-semantic-danger-tint p-3">
          <p className="text-sm text-ink-1">
            This approval is <strong>irrevocable</strong>: posting will trigger
            the GL booking. Confirm to proceed.
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelPending}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handlePost("approve", undefined)}
              className="rounded-sm bg-semantic-danger px-3 py-1 font-mono text-mono-sm text-paper hover:opacity-90"
            >
              Confirm approve
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
