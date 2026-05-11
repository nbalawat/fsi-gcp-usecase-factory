"use client";

import * as React from "react";
import { ApprovalGate, type ApprovalRecommendation } from "@primitives";

export interface SendToCustomerClientProps {
  caseId: string;
  recommendation: ApprovalRecommendation;
  /** Where to return after disposition */
  returnHref: string;
}

/**
 * Client-only wrapper around <ApprovalGate>. The /approval/[id] route is
 * THE only place option-C makes an irrevocable commit: hitting "Send to
 * customer" dispatches a customer-visible communication.
 *
 * State is local-only here; in production this would POST to the sink
 * and refresh from server. The visible affordance — the explicit
 * "(irrevocable)" copy + the warning dialog — is the discipline the
 * canvas HITL_GATES contract requires.
 */
export const SendToCustomerClient: React.FC<SendToCustomerClientProps> = ({
  caseId,
  recommendation,
  returnHref,
}) => {
  const [sent, setSent] = React.useState(false);
  const [returned, setReturned] = React.useState<null | "edit" | "reject">(null);
  const [comment, setComment] = React.useState("");

  if (sent) {
    return (
      <section
        aria-label="Send confirmation"
        className="rounded-md border border-accent bg-accent-tint p-5"
      >
        <h2 className="font-serif text-h3 font-semi text-ink-1">
          Sent ✓ — customer-visible communication dispatched
        </h2>
        <p className="mt-2 text-body-sm text-ink-1">
          The recommendation for case {caseId} has been transmitted. This
          action is irrevocable; any reversal must be a separate, audited
          customer-care intervention.
        </p>
        <div className="mt-4">
          <a
            href={returnHref}
            className="rounded-sm border border-border-strong bg-paper px-4 py-2 text-ui font-semi text-ink-1 hover:bg-paper-2"
          >
            ← Back to queue
          </a>
        </div>
      </section>
    );
  }

  if (returned) {
    return (
      <section
        aria-label="Disposition recorded"
        className="rounded-md border border-rule bg-paper-2 p-5"
      >
        <h2 className="font-serif text-h3 font-semi text-ink-1">
          Disposition recorded · {returned}
        </h2>
        <p className="mt-2 text-body-sm text-ink-1">
          The {returned} reason has been logged. The case stays on the
          queue under the reversible disposition surface.
        </p>
        {comment && (
          <blockquote className="mt-2 rounded-sm border-l-2 border-border-strong bg-paper px-3 py-2 font-mono text-mono-sm text-ink-2">
            {comment}
          </blockquote>
        )}
        <div className="mt-4">
          <a
            href={returnHref}
            className="rounded-sm border border-border-strong bg-paper px-4 py-2 text-ui font-semi text-ink-1 hover:bg-paper-2"
          >
            ← Back to queue
          </a>
        </div>
      </section>
    );
  }

  return (
    <ApprovalGate
      caseId={caseId}
      recommendation={recommendation}
      onAccept={() => setSent(true)}
      onEdit={(_id, c) => {
        setComment(c);
        setReturned("edit");
      }}
      onReject={(_id, c) => {
        setComment(c);
        setReturned("reject");
      }}
    />
  );
};
