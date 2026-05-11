"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { DeclineReason, TuneAction, TuneActionKind } from "../lib/data";

const KIND_TONE: Record<
  TuneActionKind,
  { className: string; ariaLabel: string }
> = {
  override_for_customer: {
    className:
      "border-accent text-accent-pressed hover:bg-accent-tint focus:bg-accent-tint",
    ariaLabel: "Override for this customer",
  },
  add_to_allowlist: {
    className:
      "border-semantic-info text-semantic-info hover:bg-semantic-infoTint focus:bg-semantic-infoTint",
    ariaLabel: "Add to allowlist",
  },
  tune_threshold: {
    className:
      "border-semantic-warning text-semantic-warning hover:bg-semantic-warningTint focus:bg-semantic-warningTint",
    ariaLabel: "Tune threshold",
  },
  step_up_for_review: {
    className:
      "border-rule text-ink-2 hover:bg-paper-2 focus:bg-paper-2",
    ariaLabel: "Route to step-up",
  },
};

const SOURCE_BADGE: Record<
  DeclineReason["source"],
  { kind: "info" | "accent" | "warning"; label: string }
> = {
  agent: { kind: "info", label: "agent" },
  service: { kind: "accent", label: "service" },
  rule: { kind: "warning", label: "rule" },
};

export interface DeclineReasonActionsProps {
  reason: DeclineReason;
  /** Called when the analyst clicks an inline tune action. The host
   *  decides what to do (open a side panel, fire an audit row, etc.). */
  onAction: (kind: TuneActionKind, reason: DeclineReason) => void;
  /** Optional kind already disposed for this reason — renders as a badge. */
  disposed?: TuneActionKind;
  /** Compact mode collapses the explanation paragraph; used in the bulk
   *  stream where horizontal space is at a premium. */
  compact?: boolean;
}

/**
 * The signature element of option C: one decline reason, with its inline
 * affordances rendered alongside the reason itself. The analyst can
 * dispose of the model output from where the model says "I declined
 * because…", instead of navigating somewhere else first.
 *
 * Every button is a real `<button type="button" onClick=…>` — no bare
 * div-as-button pattern. Inline-per-section is the affordance pattern.
 */
export const DeclineReasonActions: React.FC<DeclineReasonActionsProps> = ({
  reason,
  onAction,
  disposed,
  compact = false,
}) => {
  const badge = SOURCE_BADGE[reason.source];
  return (
    <article
      data-reason-id={reason.id}
      className="rounded-md border border-rule bg-paper px-4 py-3"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <StatusBadge kind={badge.kind}>{badge.label}</StatusBadge>
          <h3 className="font-serif text-base font-semibold text-ink-1">
            {reason.label}
          </h3>
          <span className="font-mono text-mono-sm text-ink-3">
            {reason.sourceId}
          </span>
        </div>
        {disposed && (
          <StatusBadge kind="success">
            disposed · {labelOf(disposed)}
          </StatusBadge>
        )}
      </header>
      {!compact && (
        <p className="mt-1 text-sm text-ink-2">{reason.explanation}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {reason.actions.map((a) => (
          <ActionButton
            key={a.kind}
            action={a}
            onClick={() => onAction(a.kind, reason)}
            disabled={disposed === a.kind}
          />
        ))}
      </div>
    </article>
  );
};

interface ActionButtonProps {
  action: TuneAction;
  onClick: () => void;
  disabled: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  action,
  onClick,
  disabled,
}) => {
  const tone = KIND_TONE[action.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={action.effect}
      aria-label={`${tone.ariaLabel} — ${action.effect}`}
      className={[
        "inline-flex items-center gap-1 rounded-sm border bg-paper px-2.5 py-1 font-mono text-mono-sm",
        "disabled:cursor-not-allowed disabled:opacity-60",
        tone.className,
      ].join(" ")}
    >
      {action.label}
    </button>
  );
};

function labelOf(kind: TuneActionKind): string {
  switch (kind) {
    case "override_for_customer":
      return "Override";
    case "add_to_allowlist":
      return "Allowlist";
    case "tune_threshold":
      return "Threshold tuned";
    case "step_up_for_review":
      return "Step-up";
  }
}
