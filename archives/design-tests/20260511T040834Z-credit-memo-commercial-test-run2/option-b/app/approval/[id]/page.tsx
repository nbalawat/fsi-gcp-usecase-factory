import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  StatusBadge,
  WorkflowStageRail,
  type NavItem,
  type Stage,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { GateRespondClient } from "../../../components/GateRespondClient";
import {
  CASE_SHAPE,
  HITL_GATES,
  MODEL_PROVIDER,
  USE_CASE_ID,
  bucketByStage,
  gateStates,
  getCase,
  type RawEvt,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { gate?: string };
}

// Pre-shaped recommendations per gate. The canvas pattern (extractor-
// spreader-rater-drafter) produces them; here they are static copy for
// the demo. Components do NOT compute decisions — auditor rule.
const RECOMMENDATIONS: Record<string, ApprovalRecommendation> = {
  extraction_review: {
    decision: "ACCEPT",
    rationaleSummary:
      "Document extractor returned 0.93 confidence over 240 pages with citations attached to each extracted field. Spot-check the spreader inputs before downstream stages.",
    approvalAuthority: "Credit Analyst",
  },
  rating_review: {
    decision: "ACCEPT",
    rationaleSummary:
      "Rater-with-covenant produced a 1-pass band consistent with peer-and-industry-context and loan-serviceability outputs. Single-borrower exposure is on watch — confirm covenant package covers it.",
    approvalAuthority: "Underwriter",
  },
  draft_review: {
    decision: "ACCEPT",
    rationaleSummary:
      "Narrative-drafter produced the memo from the analyst-multisection chain. Memo-reviewer-v2 cleared citation density.",
    approvalAuthority: "Senior Underwriter",
  },
  final_approval: {
    decision: "APPROVE",
    rationaleSummary:
      "All upstream gates accepted. Rule verdicts: 3 pass, 1 watch (single-borrower). Final signoff posts the loan to GL.",
    approvalAuthority: "Credit Officer",
    irrevocable: true,
  },
};

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "Case detail", icon: "inbox" },
  { id: "approval", label: "Approval flow", icon: "activity" },
  { id: "agents", label: "Agents", icon: "bot" },
];

/**
 * Build the per-gate scope from the event stream. Scope = every event
 * since the previous gate decision through this gate's pending event.
 * Pure shape transform — no business decisions, no math.
 */
function buildScopes(
  events: readonly RawEvt[],
  gates: readonly string[],
): Record<string, RawEvt[]> {
  const out: Record<string, RawEvt[]> = {};
  let cursor = 0;
  for (const g of gates) {
    const pendingIdx = events.findIndex(
      (e, i) =>
        i >= cursor && e.kind === "human_action_pending" && e.gate === g,
    );
    if (pendingIdx === -1) {
      out[g] = [];
      continue;
    }
    out[g] = [...events.slice(cursor, pendingIdx + 1)];
    const decidedIdx = events.findIndex(
      (e, i) =>
        i > pendingIdx && e.kind === "human_action" && e.gate === g,
    );
    cursor = decidedIdx === -1 ? pendingIdx + 1 : decidedIdx + 1;
  }
  return out;
}

export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const buckets = bucketByStage(c.events, CASE_SHAPE.stages, c.current_stage);
  const gates = gateStates(c.events, c.hitl_gates);
  const scopes = buildScopes(c.events, HITL_GATES);

  // Initial gate: searchParam if valid, else first pending, else first.
  const requested = searchParams?.gate;
  const requestedValid =
    requested && HITL_GATES.includes(requested) ? requested : undefined;
  const firstPending = gates.find((g) => g.status === "pending")?.id;
  const initialGate =
    requestedValid ??
    firstPending ??
    gates[0]?.id ??
    HITL_GATES[0] ??
    "extraction_review";

  // The workflow rail stays here too — same metaphor, both pages, so
  // the reviewer always sees where they are in the pipeline.
  const railStages: Stage[] = buckets.map((b) => ({
    id: b.id,
    name: b.label,
    type: "mixed" as const,
    count: b.events.length,
  }));
  const activeStageId =
    buckets.find((b) => b.status === "active")?.id ?? c.current_stage;

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Approval flow"
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

      <header className="border-b border-rule bg-paper px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Approval flow</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {c.title}
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-3">
              Every gate is rendered as the slice of workflow that led up
              to it. The pipeline spine stays visible so you always know
              where in the case you are.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
            <a
              href={`/case/${c.id}`}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              Back to case
            </a>
          </div>
        </div>
      </header>

      {/* Spine — same WorkflowStageRail as the case page. */}
      <WorkflowStageRail stages={railStages} currentStage={activeStageId} />

      <div className="px-6 py-5">
        <GateRespondClient
          caseId={c.id}
          gates={gates}
          scopes={scopes}
          recommendations={RECOMMENDATIONS}
          initialGate={initialGate}
        />
      </div>
    </AppShell>
  );
}
