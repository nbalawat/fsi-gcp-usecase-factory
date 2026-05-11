"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import type { GateState } from "../lib/data";

export interface CfoAttestClientProps {
  caseId: string;
  /** Total allowance figure the CFO must attest */
  totalAllowanceLabel: string;
  /** Number of segments rolled up into this run */
  segmentCount: number;
  /** Weighted PD across the run, banker-formatted */
  weightedPdLabel: string;
  /** Methodology owners whose approvals must precede the CFO sign-off */
  methodologyOwners: string[];
  /** The cfo_attest_run gate from the canvas */
  cfoGate: GateState;
  /** The segment-methodology gate (already approved; render as evidence) */
  segmentMethodologyGate: GateState;
}

/**
 * The ONLY action that escapes inline. CFO attestation is irrevocable
 * (per the canvas hitl_gates contract); it lives on /approval where the
 * full rolled-up artifact is visible alongside the ApprovalGate primitive.
 *
 * The page is intentionally a single-column read: the CFO sees what they
 * are attesting to, then signs off. No surrounding noise, no other gates
 * to dispose of — everything reversible already happened on the run-overview.
 */
export const CfoAttestClient: React.FC<CfoAttestClientProps> = ({
  caseId,
  totalAllowanceLabel,
  segmentCount,
  weightedPdLabel,
  methodologyOwners,
  cfoGate,
  segmentMethodologyGate,
}) => {
  const [decision, setDecision] = React.useState<
    "pending" | "accept" | "edit" | "reject"
  >(cfoGate.status === "completed" ? "accept" : "pending");
  const [comment, setComment] = React.useState<string>("");

  const recommendation: ApprovalRecommendation = {
    decision: "APPROVE",
    riskBand: "1-pass",
    rationaleSummary: `Roll-up of ${segmentCount} segments. All segment-methodology approvals are recorded. The Q2 allowance figure is ${totalAllowanceLabel}; weighted PD across the run is ${weightedPdLabel}. ${cfoGate.description}`,
    approvalAuthority: "CFO",
    irrevocable: cfoGate.irrevocable,
  };

  const completed = decision !== "pending";

  return (
    <section
      aria-label="CFO attestation"
      className="flex flex-col gap-4"
    >
      {/* Evidence — what the CFO is attesting to */}
      <article
        aria-label="Attestation evidence"
        className="rounded-md border border-rule bg-paper-2 p-5"
      >
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <div className="eyebrow">Attestation scope</div>
            <h2 className="font-serif text-h2 font-semi text-ink-1">
              Q2 CECL allowance · {totalAllowanceLabel}
            </h2>
          </div>
          <StatusBadge
            kind={
              segmentMethodologyGate.status === "completed"
                ? "success"
                : "neutral"
            }
          >
            segment methodology: {segmentMethodologyGate.status}
          </StatusBadge>
        </header>

        <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-sm border border-rule bg-paper p-3">
            <dt className="eyebrow">Segments rolled up</dt>
            <dd className="mt-1 font-serif text-h3 font-semi tabular-nums text-ink-1">
              {segmentCount}
            </dd>
          </div>
          <div className="rounded-sm border border-rule bg-paper p-3">
            <dt className="eyebrow">Weighted PD</dt>
            <dd className="mt-1 font-mono text-h3 font-semi tabular-nums text-ink-1">
              {weightedPdLabel}
            </dd>
          </div>
          <div className="rounded-sm border border-rule bg-paper p-3">
            <dt className="eyebrow">Methodology owners</dt>
            <dd className="mt-1 font-mono text-mono-sm leading-tight text-ink-2">
              {methodologyOwners.join(" · ")}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-body-sm text-ink-2">
          This action is <strong>irrevocable</strong>. Posting attestation
          publishes the Q2 allowance to the GL and freezes the run for the
          quarter-close package. To make further methodology adjustments,
          cancel here and return to the run overview — segment-level
          approvals are reversible until this gate is signed.
        </p>
      </article>

      {/* The ONLY approval gate that escapes inline — the shared primitive
           carries the irrevocable confirm flow. */}
      <ApprovalGate
        caseId={caseId}
        recommendation={recommendation}
        disabled={completed}
        onAccept={(id) => {
          setDecision("accept");
          setComment(`CFO attestation accepted for ${id}`);
        }}
        onEdit={(_id, c) => {
          setDecision("edit");
          setComment(c);
        }}
        onReject={(_id, c) => {
          setDecision("reject");
          setComment(c);
        }}
      />

      {completed && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "rounded-md border px-4 py-3 font-mono text-mono-sm",
            decision === "accept"
              ? "border-semantic-success bg-semantic-success-tint text-semantic-success"
              : decision === "reject"
                ? "border-semantic-danger bg-semantic-danger-tint text-semantic-danger"
                : "border-semantic-warning bg-semantic-warning-tint text-semantic-warning",
          ].join(" ")}
        >
          <div className="font-medium">
            CFO disposition: {decision.toUpperCase()}
          </div>
          {comment && <div className="mt-1 text-caption">{comment}</div>}
        </div>
      )}
    </section>
  );
};
