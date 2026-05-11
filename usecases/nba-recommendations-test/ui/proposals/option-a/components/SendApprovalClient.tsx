"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { dispositionBadgeKind, dispositionLabel, type Recommendation } from "../lib/data";

export interface SendApprovalClientProps {
  rec: Recommendation;
}

/**
 * Wraps the shared ApprovalGate primitive with use-case-specific state.
 * The "send to customer" action is irrevocable — once dispatched the
 * customer sees the recommendation; we cannot retract it.
 *
 * Per the platform's "no auto-execution of irrevocable actions" rule,
 * the ApprovalGate enforces a confirm step before the action fires.
 */
export const SendApprovalClient: React.FC<SendApprovalClientProps> = ({
  rec,
}) => {
  const [sent, setSent] = React.useState<boolean>(rec.disposition === "sent");
  const [reverted, setReverted] = React.useState<boolean>(false);
  const [rejected, setRejected] = React.useState<boolean>(false);

  const recommendation: ApprovalRecommendation = {
    decision: "SEND",
    rationaleSummary: `Send "${rec.actionLabel}" to ${rec.borrower.name}. This will surface the offer in the customer's banker conversation and the digital channel. Once sent it cannot be retracted.`,
    approvalAuthority: "Relationship Manager",
    irrevocable: true,
  };

  if (sent) {
    return (
      <section
        aria-label="Send confirmation"
        className="flex flex-col gap-3 rounded-md border border-semantic-success/60 bg-semantic-successTint p-4"
      >
        <div className="flex items-center gap-2">
          <StatusBadge kind="success">Sent</StatusBadge>
          <span className="font-mono text-mono-sm text-ink-2">{rec.id}</span>
        </div>
        <p className="text-body-sm text-ink-1">
          "{rec.actionLabel}" was sent to {rec.borrower.name}. The audit
          event has been written. Override / outcome is tracked on this
          recommendation's analytics tile.
        </p>
        <div>
          <a
            href={`/case/${rec.id}`}
            className="rounded-sm border border-rule bg-paper px-3 py-1.5 font-mono text-mono-sm text-ink-1 hover:bg-paper-2"
          >
            ← Back to recommendation
          </a>
        </div>
      </section>
    );
  }

  if (reverted) {
    return (
      <section
        aria-label="Return to revision"
        className="flex flex-col gap-3 rounded-md border border-status-warning/60 bg-status-warningBg p-4"
      >
        <div className="flex items-center gap-2">
          <StatusBadge kind="warning">Returned for revision</StatusBadge>
        </div>
        <p className="text-body-sm text-ink-1">
          Send was returned. The recommendation stays in your queue at
          "accepted" so you can dispatch it later. Your reviewer note
          was recorded on the audit trail.
        </p>
        <div>
          <a
            href={`/case/${rec.id}`}
            className="rounded-sm border border-rule bg-paper px-3 py-1.5 font-mono text-mono-sm text-ink-1 hover:bg-paper-2"
          >
            ← Back to recommendation
          </a>
        </div>
      </section>
    );
  }

  if (rejected) {
    return (
      <section
        aria-label="Rejection"
        className="flex flex-col gap-3 rounded-md border border-status-critical/60 bg-status-criticalBg p-4"
      >
        <div className="flex items-center gap-2">
          <StatusBadge kind="danger">Rejected</StatusBadge>
        </div>
        <p className="text-body-sm text-ink-1">
          The send was rejected. The recommendation moves to
          "dismissed". Your rejection reason is tracked for model
          analytics (override rate, false-positive learning).
        </p>
        <div>
          <a
            href="/"
            className="rounded-sm border border-rule bg-paper px-3 py-1.5 font-mono text-mono-sm text-ink-1 hover:bg-paper-2"
          >
            ← Back to queue
          </a>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Send confirmation"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2 rounded-md border border-rule bg-paper-2 p-4">
        <div className="flex items-center gap-2">
          <span className="eyebrow">Recommendation</span>
          <StatusBadge kind={dispositionBadgeKind(rec.disposition)}>
            {dispositionLabel(rec.disposition)}
          </StatusBadge>
        </div>
        <div className="font-serif text-h3 font-semi text-ink-1">
          {rec.actionLabel}
        </div>
        <div className="font-mono text-mono-sm text-ink-3">
          {rec.borrower.name} · {rec.id}
        </div>
        <p className="mt-1 text-body-sm text-ink-2">{rec.rationale}</p>
      </div>

      <ApprovalGate
        caseId={rec.id}
        recommendation={recommendation}
        onAccept={() => setSent(true)}
        onEdit={() => setReverted(true)}
        onReject={() => setRejected(true)}
      />
    </section>
  );
};
