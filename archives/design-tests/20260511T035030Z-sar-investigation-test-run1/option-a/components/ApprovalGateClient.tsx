"use client";

import * as React from "react";
import {
  ApprovalGate,
  type ApprovalRecommendation,
} from "@fsi-bank/components";

export interface ApprovalGateClientProps {
  caseId: string;
  recommendation: ApprovalRecommendation;
  /** Action pre-selected from query param: file_sar | dismiss | escalate */
  prefill?: "file_sar" | "dismiss" | "escalate";
}

/**
 * Thin client wrapper around the shared ApprovalGate primitive.
 * The handler-side dispositions are recorded into local state so the
 * sparse-executive page can show a quick "submitted" confirmation
 * without leaving the screen — the BSA Officer expects to triage 30+
 * cases an hour and should not be modal-bounced for each one.
 */
export const ApprovalGateClient: React.FC<ApprovalGateClientProps> = ({
  caseId,
  recommendation,
  prefill,
}) => {
  const [submitted, setSubmitted] = React.useState<
    null | { kind: "accept" | "edit" | "reject"; comment?: string }
  >(null);

  if (submitted) {
    return (
      <section
        aria-label="Disposition submitted"
        className="flex flex-col gap-3 rounded-sm border border-rule bg-paper-2 p-6"
      >
        <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
          disposition recorded
        </span>
        <p className="font-serif text-xl text-ink-1">
          {submitted.kind === "accept"
            ? "SAR signed off — passed to FinCEN sink."
            : submitted.kind === "reject"
              ? "Case dismissed — closed with note."
              : "Returned to investigator with comment."}
        </p>
        {submitted.comment && (
          <p className="text-sm text-ink-2">“{submitted.comment}”</p>
        )}
        <div className="flex gap-2 pt-2">
          <a
            href="/"
            className="rounded-sm bg-ink-1 px-4 py-2 font-mono text-sm text-paper hover:bg-ink-2"
          >
            Next case →
          </a>
          <button
            type="button"
            onClick={() => setSubmitted(null)}
            className="rounded-sm border border-rule px-4 py-2 font-mono text-sm text-ink-2 hover:bg-paper-3"
          >
            Undo
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {prefill && (
        <div className="rounded-sm border border-rule bg-paper-2 px-3 py-2 font-mono text-xs text-ink-2">
          pre-selected action from queue: <strong>{prefill}</strong>
        </div>
      )}
      <ApprovalGate
        caseId={caseId}
        recommendation={recommendation}
        onAccept={(id) => setSubmitted({ kind: "accept" })}
        onEdit={(id, comment) => setSubmitted({ kind: "edit", comment })}
        onReject={(id, comment) => setSubmitted({ kind: "reject", comment })}
      />
    </div>
  );
};
