"use client";

import * as React from "react";
import type { RecDisposition } from "../lib/data";

export interface DispositionButtonsProps {
  recId: string;
  disposition: RecDisposition;
  /** Optional href to the send-to-customer approval flow (for accepted recs) */
  sendHref?: string;
  /** Optional href to the detail page (drill-in) */
  detailHref?: string;
  /** Compact mode hides labels under sm; for narrow row layouts */
  compact?: boolean;
}

/**
 * Inline disposition controls for a row in the queue.
 *
 * Per the seed: "each row is a complete unit; no click-through needed
 * for triage". The three triage actions (Accept / Snooze / Dismiss)
 * are all reversible — they dispatch to the local mock state.
 *
 * The fourth, "Send →", is the irrevocable customer-facing action; it
 * only appears for already-accepted recs and routes to /approval/[id]
 * (the ApprovalGate page) where the RM confirms.
 */
export const DispositionButtons: React.FC<DispositionButtonsProps> = ({
  recId,
  disposition,
  sendHref,
  detailHref,
  compact = false,
}) => {
  const [local, setLocal] = React.useState<RecDisposition>(disposition);

  // Reset local state if the parent-derived state changes (route nav).
  React.useEffect(() => {
    setLocal(disposition);
  }, [disposition]);

  const handle = (next: RecDisposition) => (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setLocal(next);
  };

  // Already-accepted: surface the irrevocable Send action.
  if (local === "accepted" || local === "sent") {
    return (
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label={`Recommendation ${recId} actions`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="rounded-sm bg-semantic-successTint px-2 py-1 font-mono text-mono-sm text-semantic-success">
          {local === "sent" ? "sent" : "accepted"}
        </span>
        {local === "accepted" && sendHref && (
          <a
            href={sendHref}
            className="rounded-sm bg-brandBlack px-2.5 py-1 font-mono text-mono-sm font-semi text-paper hover:bg-ink-2"
            data-testid={`send-${recId}`}
          >
            Send to customer →
          </a>
        )}
      </div>
    );
  }

  // Dismissed / snoozed: surface a small undo control so RM can recover.
  if (local === "dismissed" || local === "snoozed") {
    return (
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label={`Recommendation ${recId} actions`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="rounded-sm bg-paper-2 px-2 py-1 font-mono text-mono-sm text-ink-3">
          {local}
        </span>
        <button
          type="button"
          onClick={handle("pending")}
          className="rounded-sm border border-rule px-2 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
          data-testid={`undo-${recId}`}
        >
          Undo
        </button>
      </div>
    );
  }

  // Pending: the triage row — Accept / Snooze / Dismiss.
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label={`Recommendation ${recId} actions`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handle("accepted")}
        className="rounded-sm bg-accent px-2.5 py-1 font-mono text-mono-sm font-semi text-brandBlack hover:bg-accent-hover"
        data-testid={`accept-${recId}`}
      >
        {compact ? "✓" : "Accept"}
      </button>
      <button
        type="button"
        onClick={handle("snoozed")}
        className="rounded-sm border border-rule px-2 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
        data-testid={`snooze-${recId}`}
      >
        {compact ? "⏱" : "Snooze"}
      </button>
      <button
        type="button"
        onClick={handle("dismissed")}
        className="rounded-sm border border-rule px-2 py-1 font-mono text-mono-sm text-ink-3 hover:bg-status-criticalBg hover:text-status-critical"
        data-testid={`dismiss-${recId}`}
      >
        {compact ? "✕" : "Dismiss"}
      </button>
      {detailHref && (
        <a
          href={detailHref}
          className="ml-1 rounded-sm border border-transparent px-1.5 py-1 font-mono text-mono-sm text-ink-3 hover:border-rule hover:text-ink-1"
          data-testid={`drill-${recId}`}
          onClick={(e) => e.stopPropagation()}
        >
          Open →
        </a>
      )}
    </div>
  );
};
