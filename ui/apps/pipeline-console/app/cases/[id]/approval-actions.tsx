"use client";

import {
  ApprovalGate,
  type ApprovalRecommendation,
} from "@fsi-bank/components";
import { useState } from "react";

interface Props {
  caseId: string;
  recommendation: ApprovalRecommendation;
  disabled: boolean;
}

/**
 * Client wrapper around ApprovalGate that POSTs to the mock /api/approve.
 * In production this calls the BFF, which validates the role and writes
 * an audit_log entry before invoking the Cloud Workflows callback.
 */
export function ApprovalActions({
  caseId,
  recommendation,
  disabled,
}: Props): JSX.Element {
  const [status, setStatus] = useState<string | null>(null);

  const post = async (
    disposition: "accept" | "return" | "escalate",
    comment?: string,
  ): Promise<void> => {
    setStatus("Submitting…");
    try {
      const r = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loan_id: caseId,
          disposition,
          comment,
          officer_id: "demo-officer",
        }),
      });
      const body = (await r.json()) as { ok: boolean; audit_log_id?: string };
      setStatus(
        body.ok ? `Submitted (${body.audit_log_id ?? "ok"})` : "Failed",
      );
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <ApprovalGate
        caseId={caseId}
        recommendation={recommendation}
        disabled={disabled}
        onAccept={(id) => void post("accept")}
        onEdit={(id, comment) => void post("return", comment)}
        onReject={(id, comment) => void post("escalate", comment)}
      />
      {status && (
        <div className="text-xs text-text-muted" aria-live="polite">
          {status}
        </div>
      )}
    </div>
  );
}
