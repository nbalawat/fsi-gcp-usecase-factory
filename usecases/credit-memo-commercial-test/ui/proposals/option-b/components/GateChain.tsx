"use client";

import * as React from "react";
import {
  ApprovalGate,
  StatusBadge,
  type ApprovalRecommendation,
} from "@fsi-bank/components";
import {
  HITL_GATES,
  gateLabel,
  gateDecision,
  relativeTime,
  LIVE_CASE,
} from "../lib/data";

export interface GateChainProps {
  caseId: string;
}

/**
 * Sequential rendering of the four canvas HITL gates:
 *   extraction_review → rating_review → draft_review → final_approval
 *
 * Each gate has an ApprovalGate surface (shared primitive). Already-decided
 * gates render in a "history" mode (read-only summary). The first pending
 * gate, or the last one if all are done, is the live one with handlers.
 */
export const GateChain: React.FC<GateChainProps> = ({ caseId }) => {
  // Identify the first pending gate (the one the user must action). If all
  // are already decided in mock-data, we still render `final_approval` live
  // for the demo so the credit officer has an actionable surface.
  const firstPendingIdx = HITL_GATES.findIndex((g) => !gateDecision(g));
  const liveIdx =
    firstPendingIdx === -1 ? HITL_GATES.length - 1 : firstPendingIdx;

  return (
    <section
      aria-label="Approval gate chain"
      className="flex flex-col gap-4"
    >
      <header className="flex items-baseline justify-between border-b border-rule pb-3">
        <div>
          <div className="eyebrow">Human-in-the-loop gates</div>
          <h2 className="font-serif text-h2 font-semi text-ink-1">
            Four-gate approval flow
          </h2>
        </div>
        <span className="font-mono text-mono-sm text-ink-3">
          {firstPendingIdx === -1
            ? "all gates approved"
            : `${liveIdx + 1} of ${HITL_GATES.length}`}
        </span>
      </header>

      <ol className="flex flex-col gap-4">
        {HITL_GATES.map((gate, i) => (
          <li
            key={gate}
            id={`gate-${gate}`}
            className="flex flex-col gap-2"
          >
            <GateHeader
              index={i}
              gate={gate}
              isLive={i === liveIdx}
            />
            {i === liveIdx ? (
              <LiveGate gate={gate} caseId={caseId} />
            ) : (
              <DecidedGate gate={gate} />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};

const GateHeader: React.FC<{
  index: number;
  gate: string;
  isLive: boolean;
}> = ({ index, gate, isLive }) => {
  const decision = gateDecision(gate);
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-mono-sm font-semibold tabular-nums ${
          isLive
            ? "bg-accent text-paper"
            : decision
              ? "bg-semantic-success text-paper"
              : "bg-paper-3 text-ink-3"
        }`}
      >
        {index + 1}
      </span>
      <h3 className="text-h4 font-semi text-ink-1">{gateLabel(gate)}</h3>
      <StatusBadge
        kind={
          decision ? "success" : isLive ? "accent" : "neutral"
        }
      >
        {decision ? `${decision.decision} · ${relativeTime(decision.at)}` : isLive ? "needs you" : "queued"}
      </StatusBadge>
    </div>
  );
};

const DecidedGate: React.FC<{ gate: string }> = ({ gate }) => {
  const decision = gateDecision(gate);
  if (!decision) {
    return (
      <div className="rounded-md border border-rule bg-paper-2 p-3 text-ui text-ink-2">
        Queued. Waiting on the prior gate to clear.
      </div>
    );
  }
  return (
    <article
      aria-label={`Decided gate: ${gateLabel(gate)}`}
      className="rounded-md border border-rule bg-semantic-successTint/40 p-4"
    >
      <p className="text-body text-ink-1">
        <span className="font-medium">Decided {decision.decision}</span>
        <span className="ml-2 font-mono text-mono-sm text-ink-3">
          {relativeTime(decision.at)}
        </span>
      </p>
      <p className="mt-1 text-caption text-ink-3">
        Recorded in the agentic audit trail. No further action required.
      </p>
    </article>
  );
};

const LiveGate: React.FC<{ gate: string; caseId: string }> = ({
  gate,
  caseId,
}) => {
  const recommendation = recommendationForGate(gate);
  // No-op handlers — design surface only. The real approval flow wires
  // these to the bank's audit-writer + sink. UI primitive enforces the
  // "comment required for reject/return" rule.
  const onAccept = (id: string): void => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(`[option-b] accept ${gate} for case ${id}`);
    }
  };
  const onEdit = (id: string, comment: string): void => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(`[option-b] return ${gate} for case ${id}: ${comment}`);
    }
  };
  const onReject = (id: string, comment: string): void => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(`[option-b] reject ${gate} for case ${id}: ${comment}`);
    }
  };

  return (
    <ApprovalGate
      caseId={caseId}
      recommendation={recommendation}
      onAccept={onAccept}
      onEdit={onEdit}
      onReject={onReject}
    />
  );
};

function recommendationForGate(gate: string): ApprovalRecommendation {
  // Canvas vocabulary only — pulls verbatim from mock-data where possible.
  switch (gate) {
    case "extraction_review":
      return {
        decision: "APPROVE",
        rationaleSummary:
          "Document-extractor reports 93% confidence on the 10-K. Citation density is above the 80% threshold for the standard set.",
        approvalAuthority: "Analyst",
      };
    case "rating_review":
      return {
        decision: "APPROVE",
        riskBand: LIVE_CASE.borrower.risk_band,
        rationaleSummary:
          "Rater-with-covenant proposes a 1-pass risk band. DSCR and leverage rules pass; single-borrower exposure is on watch.",
        approvalAuthority: "Credit analyst",
      };
    case "draft_review":
      return {
        decision: "APPROVE",
        rationaleSummary:
          "Narrative-drafter produced the memo. Memo-reviewer-v2 found no missing citations or contradictions.",
        approvalAuthority: "Credit officer",
      };
    case "final_approval":
      return {
        decision: LIVE_CASE.decision.toUpperCase(),
        riskBand: LIVE_CASE.borrower.risk_band,
        rationaleSummary:
          "All upstream gates cleared. Three of four shared rules pass; single-borrower exposure rule is on watch (within tolerance).",
        approvalAuthority: "Credit officer (Tier 2)",
        irrevocable: true,
      };
    default:
      return {
        decision: "REVIEW",
        rationaleSummary: "Awaiting upstream signal.",
      };
  }
}
