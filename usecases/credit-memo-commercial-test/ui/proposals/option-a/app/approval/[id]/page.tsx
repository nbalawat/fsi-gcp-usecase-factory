import * as React from "react";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { ExecutiveHeader } from "../../../components/ExecutiveHeader";
import { ApprovalFlowClient } from "../../../components/ApprovalFlowClient";
import {
  getDecisionCard,
  getGateStatuses,
  HITL_GATES,
} from "../../../lib/data";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

// Per-gate recommendation copy — purely presentational; the decision values
// themselves come from the agent / rules layer in production. In option-a
// (mock contract), we map each canvas HITL gate to a recommendation card.
// NO thresholds, NO ratios — these are static labels keyed off the gate id.
const RECOMMENDATIONS: Record<string, ApprovalRecommendation> = {
  extraction_review: {
    decision: "APPROVE",
    rationaleSummary:
      "All required fields extracted at 93% confidence; no going-concern qualification; citations attached.",
    approvalAuthority: "Credit analyst",
  },
  rating_review: {
    decision: "APPROVE",
    rationaleSummary:
      "Risk-band assignment consistent with peer set and covenant package; one rule on borrower exposure flagged for watch.",
    approvalAuthority: "Senior credit analyst",
  },
  draft_review: {
    decision: "APPROVE",
    rationaleSummary:
      "Memo narrative aligned with extracted data and rating; reviewer flagged no factual deltas.",
    approvalAuthority: "Underwriter",
  },
  final_approval: {
    decision: "APPROVE",
    rationaleSummary:
      "All upstream gates cleared. $25M revolver. Final sign-off booked to ledger upon approval.",
    approvalAuthority: "Credit Officer",
    irrevocable: true,
  },
};

/**
 * APPROVAL FLOW — sparse executive density.
 *
 * One column. Four gates stacked vertically. Decided gates collapse to a
 * single-line strip; the active gate is the only thing that takes vertical
 * space. Final approval is irrevocable and uses the shared ApprovalGate's
 * confirm dialog.
 */
export default function ApprovalFlowPage({ params }: PageProps): JSX.Element {
  const card = getDecisionCard();
  const gates = getGateStatuses();

  // Hard contract check: every canvas HITL gate has a recommendation surface.
  // This is the rule the auditor explicitly enforces. If a gate were missing,
  // the render below would silently omit it; this assertion makes it visible
  // at build / first-render time.
  const missing = HITL_GATES.filter((g) => !(g in RECOMMENDATIONS));
  if (missing.length > 0) {
    throw new Error(
      `option-a: HITL gates without an approval surface: ${missing.join(", ")}`,
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <ExecutiveHeader
        caseId={params.id}
        borrowerName={card.borrowerName}
        stage="approval"
        riskBand={card.riskBand}
        rightAction={{ label: "← Case detail", href: `/case/${params.id}` }}
      />

      <section className="mx-auto w-full max-w-2xl px-8 py-10">
        <div className="eyebrow text-ink-3">Approval flow</div>
        <h1 className="mt-1 font-serif text-h2 font-semi text-ink-1">
          Four gates
        </h1>
        <p className="mt-2 text-ui text-ink-2">
          One column. The active gate is open; the others collapse.
        </p>

        <div className="mt-8">
          <ApprovalFlowClient
            caseId={params.id}
            gates={gates}
            recommendations={RECOMMENDATIONS}
          />
        </div>
      </section>
    </main>
  );
}
