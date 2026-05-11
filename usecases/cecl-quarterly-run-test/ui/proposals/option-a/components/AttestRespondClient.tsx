"use client";

import * as React from "react";
import {
  ApprovalGate,
  type ApprovalRecommendation,
} from "@fsi-bank/components";

interface Props {
  caseId: string;
  recommendation: ApprovalRecommendation;
}

/**
 * Thin client wrapper that owns the disposition handlers for the CFO
 * attestation gate. The Server page passes the recommendation shape
 * (computed from the run state) and this component handles the click
 * → log → confirm flow without crossing the Server/Client boundary
 * with functions (Rule 4 of UI standards).
 *
 * The mock writes the disposition to a banner in-page so the demo
 * surface stays self-contained.
 */
export const AttestRespondClient: React.FC<Props> = ({
  caseId,
  recommendation,
}) => {
  const [disposed, setDisposed] = React.useState<null | {
    kind: "accept" | "edit" | "reject";
    comment?: string;
  }>(null);

  if (disposed) {
    return (
      <section
        role="status"
        aria-live="polite"
        className="rounded-md border border-semantic-success bg-semantic-success-tint p-4"
      >
        <div className="font-mono text-mono-sm text-semantic-success">
          Attestation dispatched · {disposed.kind.toUpperCase()}
        </div>
        <div className="mt-1 text-ui text-ink-1">
          {disposed.kind === "accept"
            ? `CFO attestation for ${caseId} recorded. Allowance posted to GL and SEC 10-Q draft updated.`
            : disposed.kind === "edit"
              ? `Returned to risk analytics with comment: "${disposed.comment ?? ""}".`
              : `Run rejected with comment: "${disposed.comment ?? ""}". Escalated to Audit Committee.`}
        </div>
      </section>
    );
  }

  return (
    <ApprovalGate
      caseId={caseId}
      recommendation={recommendation}
      onAccept={(id) => setDisposed({ kind: "accept" })}
      onEdit={(id, comment) => setDisposed({ kind: "edit", comment })}
      onReject={(id, comment) => setDisposed({ kind: "reject", comment })}
    />
  );
};
