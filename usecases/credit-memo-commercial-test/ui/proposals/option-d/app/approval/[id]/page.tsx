import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { GateRespondClient } from "../../../components/GateRespondClient";
import {
  HITL_GATES,
  MODEL_PROVIDER,
  USE_CASE_ID,
  gateStates,
  getCase,
  toTranscript,
  type TranscriptRow as RowData,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { gate?: string };
}

// Pre-shaped recommendations per gate. These come from the canvas
// pattern (extractor-spreader-rater-drafter); the wording is fixed copy
// for the demo. No decision math — components/auditor rule.
const RECOMMENDATIONS: Record<string, ApprovalRecommendation> = {
  extraction_review: {
    decision: "ACCEPT",
    rationaleSummary:
      "Document extractor returned 0.93 confidence over 240 pages with citations attached to each extracted field. Spot-check before downstream spreading.",
    approvalAuthority: "Credit Analyst",
  },
  rating_review: {
    decision: "ACCEPT",
    rationaleSummary:
      "Rater-with-covenant produced a 1-pass band consistent with the peer-and-industry-context and loan-serviceability outputs. Single-borrower exposure is on watch — confirm covenant package covers it.",
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
 * Build the per-gate transcript scope. For each gate, the scope is
 * every event from "the start (or after the previous gate decided)"
 * UP TO AND INCLUDING the human_action_pending for this gate. This
 * gives the reviewer everything they need to sign off — without
 * leaking the future of the timeline.
 *
 * Pure shape transform — no business decisions, no math.
 */
function buildScopes(
  rows: readonly RowData[],
  gates: readonly string[],
): Record<string, RowData[]> {
  const out: Record<string, RowData[]> = {};
  let cursor = 0;
  for (const g of gates) {
    const endIdx = rows.findIndex(
      (r, i) => i >= cursor && r.gate === g && r.actor === "gate",
    );
    if (endIdx === -1) {
      // No pending event yet for this gate — scope is empty.
      out[g] = [];
      continue;
    }
    out[g] = rows.slice(cursor, endIdx + 1);
    // Advance the cursor past the matching human_action (decided) row,
    // if one exists, so the next gate starts fresh.
    const decidedIdx = rows.findIndex(
      (r, i) =>
        i > endIdx && r.gate === g && r.actor === "human" && r.decision,
    );
    cursor = decidedIdx === -1 ? endIdx + 1 : decidedIdx + 1;
  }
  return out;
}

export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const allRows = toTranscript(c.events);
  const scopes = buildScopes(allRows, HITL_GATES);
  const gates = gateStates(c.events, c.hitl_gates);

  // Initial gate: query param if present and valid, else the first
  // pending gate, else the first gate.
  const requested = searchParams?.gate;
  const requestedValid =
    requested && HITL_GATES.includes(requested) ? requested : undefined;
  const firstPending = gates.find((g) => g.status === "pending")?.id;
  const initialGate = requestedValid ?? firstPending ?? gates[0]?.id ?? HITL_GATES[0] ?? "extraction_review";

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

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Approval flow</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {c.title}
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-3">
              Every gate is rendered as the slice of conversation that led
              up to it. Pick a gate, read the slice, dispose — the
              disposition becomes a new transcript row on the case.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
            <a
              href={`/case/${c.id}`}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              ← Full transcript
            </a>
          </div>
        </div>
      </header>

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
