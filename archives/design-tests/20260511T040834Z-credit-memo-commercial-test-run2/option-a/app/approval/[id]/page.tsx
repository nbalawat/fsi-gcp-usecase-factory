import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  StatCard,
  StatusBadge,
  StepProgress,
  type NavItem,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { GateApprovalClient } from "../../../components/GateApprovalClient";
import {
  CANVAS_SHA256,
  COMPLIANCE_SCOPE,
  HITL_GATES,
  MODEL_PROVIDER,
  USE_CASE_ID,
  gateStates,
  getCase,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { gate?: string };
}

// Pre-shaped recommendations per gate. These come from the canvas
// pattern (extractor-spreader-rater-drafter); the wording is fixed
// copy for the demo. No decision math in components — auditor rule.
const RECOMMENDATIONS: Record<string, ApprovalRecommendation> = {
  extraction_review: {
    decision: "ACCEPT",
    rationaleSummary:
      "Document extractor returned 0.93 confidence over 240 pages with citations attached to each extracted field. Spot-check before downstream spreading.",
    approvalAuthority: "Credit Analyst",
  },
  rating_review: {
    decision: "ACCEPT",
    riskBand: "1-pass",
    rationaleSummary:
      "Rater placed the credit at a 1-pass band consistent with peer-and-industry-context and loan-serviceability outputs. Single-borrower exposure is on watch — confirm the covenant package covers it.",
    approvalAuthority: "Underwriter",
  },
  draft_review: {
    decision: "ACCEPT",
    rationaleSummary:
      "Narrative-drafter produced the memo from the analyst chain. Memo-reviewer-v2 cleared citation density and tone.",
    approvalAuthority: "Senior Underwriter",
  },
  final_approval: {
    decision: "APPROVE",
    riskBand: "1-pass",
    rationaleSummary:
      "All upstream gates accepted. Rule verdicts: 3 pass, 1 watch (single-borrower). Final signoff posts the loan to GL.",
    approvalAuthority: "Chief Credit Officer",
    irrevocable: true,
  },
};

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "Case detail", icon: "inbox" },
  { id: "approval", label: "Approval", icon: "activity" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const gates = gateStates(c.events, c.hitl_gates);

  const requested = searchParams?.gate;
  const requestedValid =
    requested && HITL_GATES.includes(requested) ? requested : undefined;
  const firstPending = gates.find((g) => g.status === "pending")?.id;
  const initialGate =
    requestedValid ?? firstPending ?? gates[0]?.id ?? HITL_GATES[0] ?? "extraction_review";

  const gatesDecidedCount = gates.filter((g) => g.status === "completed").length;
  const stepStatus =
    gatesDecidedCount === gates.length
      ? "done"
      : gates.some((g) => g.status === "pending")
        ? "active"
        : "pending";

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Approval"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Commercial Credit"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref={`/case/${c.id}`}
        backLabel="Back to case"
      />

      {/* Thin context strip — one row, sparse. */}
      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-xs uppercase tracking-wider text-ink-3">
              Approval flow
            </div>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-ink-1">
              {c.title}
            </h1>
            <div className="mt-2 flex items-center gap-3 font-mono text-sm text-ink-3">
              <span>{c.id}</span>
              <span aria-hidden>·</span>
              <span>{c.borrower.name}</span>
              <span aria-hidden>·</span>
              <span>{c.borrower.geo}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind={c.decision === "approve" ? "success" : "neutral"}>
              AI recommends {c.decision}
            </StatusBadge>
            <StepProgress
              total={gates.length}
              done={gatesDecidedCount}
              status={stepStatus}
              currentLabel="gates"
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-[1fr_14rem]">
        {/* The page asks ONE question. */}
        <GateApprovalClient
          caseId={c.id}
          gates={gates}
          recommendations={RECOMMENDATIONS}
          initialGate={initialGate}
        />

        {/* Tiny right rail — canvas pin only. */}
        <aside className="flex flex-col gap-4">
          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · ${COMPLIANCE_SCOPE}`}
            tone="neutral"
          />
          <StatCard
            label="Sign-off authority"
            value="CCO"
            unit="final"
            delta="irrevocable on approve"
            tone="warning"
          />
        </aside>
      </div>
    </AppShell>
  );
}
