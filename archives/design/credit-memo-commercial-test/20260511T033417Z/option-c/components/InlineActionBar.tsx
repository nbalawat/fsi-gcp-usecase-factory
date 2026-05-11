"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { GateId, SectionDecision, SectionDecisionKind } from "../lib/data";

export interface InlineActionBarProps {
  /** The case this section belongs to. */
  caseId: string;
  /** Section id for telemetry / aria labelling. */
  sectionId: string;
  /** Banker label for the section the user is acting on. */
  sectionTitle: string;
  /** Which canvas HITL gate this surface satisfies. */
  gate: GateId;
  /** Pre-existing decision if the user already acted on this section. */
  decision: SectionDecision;
  /** Callback when the user picks an action. Comment required for non-approve. */
  onDecide: (next: SectionDecision) => void;
}

/**
 * The inline-per-section affordance: approve / edit / request-revision /
 * reject buttons that sit at the bottom of every memo section. No
 * sticky footer. No drawer. The action lives with the data that
 * informs it.
 *
 * When a decision has been made, the bar collapses to a single
 * decided-status row with an "Undo" link — keeping the user's eye on
 * the data without losing the ability to revise.
 */
export const InlineActionBar: React.FC<InlineActionBarProps> = ({
  caseId,
  sectionId,
  sectionTitle,
  gate,
  decision,
  onDecide,
}) => {
  const [comment, setComment] = React.useState<string>("");
  const [open, setOpen] = React.useState<SectionDecisionKind | null>(null);

  const inputId = `inline-comment-${sectionId}`;

  // Decided view — collapses to a single confirmation row.
  if (decision.kind !== "pending") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={`${sectionTitle} decision: ${decision.kind}`}
        className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-paper-2 px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <DecisionBadge kind={decision.kind} />
          <span className="text-body-sm text-ink-2">
            {decisionBlurb(decision.kind, gate)}
          </span>
          {decision.comment && (
            <span className="font-mono text-mono-sm text-ink-3">
              note: {decision.comment}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDecide({ kind: "pending" })}
          className="text-mono-sm text-accent hover:underline"
          aria-label={`Undo decision on ${sectionTitle}`}
        >
          Undo
        </button>
      </div>
    );
  }

  // Pending view — four-action inline bar.
  const needsComment = open !== null && open !== "approve";

  const commit = (kind: SectionDecisionKind): void => {
    if (kind === "approve") {
      onDecide({ kind });
      setOpen(null);
      setComment("");
      return;
    }
    if (!comment.trim()) return;
    onDecide({ kind, comment: comment.trim() });
    setOpen(null);
    setComment("");
  };

  return (
    <div
      role="group"
      aria-label={`Inline actions for ${sectionTitle}`}
      data-case-id={caseId}
      data-section-id={sectionId}
      data-gate={gate}
      className="mt-4 flex flex-col gap-2 rounded-md border border-rule bg-paper-2 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-mono-sm text-ink-3">
          Action — {labelForGate(gate)}
        </span>
        <span className="font-mono text-mono-sm text-ink-3">
          gate: {gate}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionBtn
          tone="primary"
          onClick={() => commit("approve")}
          ariaLabel={`Approve ${sectionTitle}`}
        >
          Approve
        </ActionBtn>
        <ActionBtn
          tone="neutral"
          pressed={open === "edit"}
          onClick={() => setOpen(open === "edit" ? null : "edit")}
          ariaLabel={`Edit ${sectionTitle}`}
        >
          Edit
        </ActionBtn>
        <ActionBtn
          tone="neutral"
          pressed={open === "request-revision"}
          onClick={() =>
            setOpen(open === "request-revision" ? null : "request-revision")
          }
          ariaLabel={`Request revision for ${sectionTitle}`}
        >
          Request revision
        </ActionBtn>
        <ActionBtn
          tone="danger"
          pressed={open === "reject"}
          onClick={() => setOpen(open === "reject" ? null : "reject")}
          ariaLabel={`Reject ${sectionTitle}`}
        >
          Reject
        </ActionBtn>
      </div>

      {needsComment && (
        <div className="mt-1 flex flex-col gap-2">
          <label
            htmlFor={inputId}
            className="text-mono-sm text-ink-3"
          >
            {commentPrompt(open)}
          </label>
          <textarea
            id={inputId}
            value={comment}
            rows={2}
            onChange={(e) => setComment(e.target.value)}
            placeholder={commentPlaceholder(open)}
            className="w-full rounded border border-rule bg-paper px-3 py-2 font-sans text-body-sm text-ink-1 focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => commit(open as SectionDecisionKind)}
              disabled={!comment.trim()}
              className="rounded bg-ink-1 px-3 py-1.5 text-mono-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirm {open}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(null);
                setComment("");
              }}
              className="rounded border border-rule px-3 py-1.5 text-mono-sm text-ink-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// Local sub-components
// ────────────────────────────────────────────────────────────────────────

interface ActionBtnProps {
  tone: "primary" | "neutral" | "danger";
  pressed?: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}

const ActionBtn: React.FC<ActionBtnProps> = ({
  tone,
  pressed,
  onClick,
  ariaLabel,
  children,
}) => {
  const base =
    "rounded px-3 py-1.5 text-mono-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent";
  const tones = {
    primary: "bg-ink-1 text-paper hover:bg-ink-2",
    neutral: pressed
      ? "bg-paper-3 text-ink-1 border border-rule"
      : "bg-paper text-ink-1 border border-rule hover:bg-paper-2",
    danger: pressed
      ? "bg-semantic-dangerTint text-semantic-danger border border-semantic-danger"
      : "bg-paper text-semantic-danger border border-semantic-danger hover:bg-semantic-dangerTint",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      className={`${base} ${tones[tone]}`}
    >
      {children}
    </button>
  );
};

const DecisionBadge: React.FC<{ kind: SectionDecisionKind }> = ({ kind }) => {
  const map: Record<
    SectionDecisionKind,
    { tone: "success" | "warning" | "danger" | "info" | "neutral"; label: string }
  > = {
    pending: { tone: "neutral", label: "pending" },
    approve: { tone: "success", label: "approved" },
    edit: { tone: "info", label: "edited" },
    "request-revision": { tone: "warning", label: "revision requested" },
    reject: { tone: "danger", label: "rejected" },
  };
  const m = map[kind];
  return <StatusBadge kind={m.tone}>{m.label}</StatusBadge>;
};

// ────────────────────────────────────────────────────────────────────────
// Static copy (no business logic — pure presentation)
// ────────────────────────────────────────────────────────────────────────

const labelForGate = (g: GateId): string => {
  switch (g) {
    case "extraction_review":
      return "Confirm extraction is faithful to the source document";
    case "rating_review":
      return "Confirm or override the analytic conclusion for this section";
    case "draft_review":
      return "Confirm the narrative is accurate before sign-off";
    case "final_approval":
      return "Sign-off — sends to closing";
    default:
      return "Inline decision";
  }
};

const commentPrompt = (kind: SectionDecisionKind | null): string => {
  switch (kind) {
    case "edit":
      return "Describe your edit (becomes part of the audit trail)";
    case "request-revision":
      return "Tell the agent what needs to change";
    case "reject":
      return "Reason for rejection (required)";
    default:
      return "Comment";
  }
};

const commentPlaceholder = (kind: SectionDecisionKind | null): string => {
  switch (kind) {
    case "edit":
      return "e.g. revised EBITDA from $804M to $812M per page 18 footnote";
    case "request-revision":
      return "e.g. re-extract page 23 — concentration table missing";
    case "reject":
      return "e.g. extraction does not match source document";
    default:
      return "";
  }
};

const decisionBlurb = (kind: SectionDecisionKind, gate: GateId): string => {
  if (kind === "approve") return `${gate.replace(/_/g, " ")} satisfied for this section.`;
  if (kind === "edit") return "Edit recorded. Downstream re-run requested.";
  if (kind === "request-revision") return "Revision requested. Section held in queue.";
  if (kind === "reject") return "Section rejected. Memo will not advance until resolved.";
  return "Awaiting your action.";
};
