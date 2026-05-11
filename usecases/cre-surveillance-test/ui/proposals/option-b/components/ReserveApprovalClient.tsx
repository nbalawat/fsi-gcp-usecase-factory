"use client";

import * as React from "react";
import { ApprovalGate, type ApprovalRecommendation } from "@fsi-bank/components";

export interface ReserveApprovalClientProps {
  caseId: string;
  recommendation: ApprovalRecommendation;
  /** Pre-fill amount of reserve (display only) */
  proposedReserveUsd: number;
  /** Banker-readable formatter (pre-formatted strings only). */
  proposedReserveLabel: string;
}

/**
 * Client island around the shared <ApprovalGate>. Holds the form state
 * for amount + disposition. NO server-defined functions are passed in —
 * the parent (Server Component) hands us only data; we own onAccept /
 * onEdit / onReject locally.
 *
 * This is a demo surface — disposition handlers post a console.log and
 * mark the local UI state as "submitted" so the reviewer sees feedback.
 */
export const ReserveApprovalClient: React.FC<ReserveApprovalClientProps> = ({
  caseId,
  recommendation,
  proposedReserveUsd,
  proposedReserveLabel,
}) => {
  const [amount, setAmount] = React.useState<number>(proposedReserveUsd);
  const [submitted, setSubmitted] = React.useState<
    null | { kind: "accept" | "edit" | "reject"; comment?: string }
  >(null);

  const onAccept = (id: string): void => {
    // Demo: log the disposition so the audit panel can mirror it.
    // In production, this POSTs to the workflow's `book_specific_reserve` step.
    // eslint-disable-next-line no-console
    console.log("ACCEPT", id, { amount });
    setSubmitted({ kind: "accept" });
  };
  const onEdit = (id: string, comment: string): void => {
    // eslint-disable-next-line no-console
    console.log("EDIT", id, { amount, comment });
    setSubmitted({ kind: "edit", comment });
  };
  const onReject = (id: string, comment: string): void => {
    // eslint-disable-next-line no-console
    console.log("REJECT", id, { amount, comment });
    setSubmitted({ kind: "reject", comment });
  };

  return (
    <section
      aria-label="Reserve booking"
      className="flex flex-col gap-4 rounded-md border border-rule bg-paper p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <div className="eyebrow">HITL · book specific reserve</div>
          <h3 className="text-h4 font-semi text-ink-1">
            Reserve amount · {proposedReserveLabel}
          </h3>
        </div>
        <div className="font-mono text-mono-sm text-ink-3">
          Recommendation seeded by the agent — reviewer can edit before booking.
        </div>
      </header>

      <label className="flex flex-col gap-1">
        <span className="eyebrow">Proposed reserve (USD)</span>
        <input
          type="number"
          min={0}
          step={100000}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="rounded-sm border border-rule bg-paper-2 px-3 py-2 font-mono text-body-sm tabular-nums text-ink-1 focus:border-accent focus:outline-none"
        />
        <span className="font-mono text-mono-sm text-ink-3">
          Booking this reserve is IRREVOCABLE — confirmation will be required.
        </span>
      </label>

      <ApprovalGate
        caseId={caseId}
        recommendation={recommendation}
        onAccept={onAccept}
        onEdit={onEdit}
        onReject={onReject}
      />

      {submitted && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-sm border border-semantic-success bg-semantic-success-tint px-3 py-2 font-mono text-mono-sm text-ink-1"
        >
          ✓ Disposition <strong>{submitted.kind}</strong> recorded for{" "}
          <span className="font-mono">{caseId}</span>
          {submitted.comment ? ` — "${submitted.comment}"` : ""}.
        </div>
      )}
    </section>
  );
};
