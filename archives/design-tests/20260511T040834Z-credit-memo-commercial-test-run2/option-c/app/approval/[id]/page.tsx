import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { MemoSection } from "../../../components/MemoSection";
import { SectionAffordanceRow } from "../../../components/SectionAffordanceRow";
import { SectionNav } from "../../../components/SectionNav";
import { RuleVerdictPanel } from "../../../components/RuleVerdictPanel";
import {
  HITL_GATES,
  HITL_LABEL,
  MODEL_PROVIDER,
  RULE_VERDICTS,
  USE_CASE_ID,
  getCase,
  partitionSections,
  type SectionState,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { gate?: string };
}

// Pre-shaped recommendations — same map as case detail (single source of
// copy). Decision math is forbidden in components per the auditor.
const RECOMMENDATIONS: Record<string, ApprovalRecommendation> = {
  extraction_review: {
    decision: "ACCEPT",
    rationaleSummary:
      "Document extractor returned 0.93 confidence across 240 pages, with citations attached to every extracted field. Spot-check before downstream spreading.",
    approvalAuthority: "Credit Analyst",
  },
  rating_review: {
    decision: "ACCEPT",
    rationaleSummary:
      "Rater-with-covenant produced a 1-pass band consistent with peer-and-industry-context and loan-serviceability. Single-borrower exposure is on watch.",
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

function buildAffordance(
  section: SectionState,
  caseId: string,
): React.ReactNode {
  if (!section.gate) return null;
  const rec = RECOMMENDATIONS[section.gate] ?? {
    decision: "RETURN_FOR_REVISION",
    rationaleSummary: "Recommendation not yet generated for this gate.",
  };
  const alreadyDecided =
    section.status === "completed" && section.decision
      ? { decision: section.decision, at: section.decidedAt ?? "" }
      : undefined;
  return (
    <SectionAffordanceRow
      caseId={caseId}
      gateId={section.gate}
      gateLabel={HITL_LABEL[section.gate] ?? section.gate}
      sectionTitle={section.title}
      recommendation={rec}
      alreadyDecided={alreadyDecided}
    />
  );
}

export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const allSections = partitionSections(c, RULE_VERDICTS);

  // Approval mode shows ONLY the gated sections (the borrower section
  // has no HITL gate). The user's anchor target is preserved as
  // ?gate=… on the URL and used for the section-nav highlight.
  const gatedSections = allSections.filter((s) => s.gate !== null);

  const requestedGate =
    searchParams?.gate && HITL_GATES.includes(searchParams.gate)
      ? searchParams.gate
      : undefined;
  const firstPending = gatedSections.find((s) => s.status === "pending");
  const focusSectionId =
    (requestedGate &&
      gatedSections.find((s) => s.gate === requestedGate)?.id) ??
    firstPending?.id ??
    gatedSections[0]?.id;

  const pendingCount = gatedSections.filter((s) => s.status === "pending").length;
  const closedCount = gatedSections.filter((s) => s.status === "completed").length;

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Approval flow · inline-per-section"
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
            <h1 className="font-serif text-2xl font-semibold text-ink-1">
              {c.title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-3">
              Each gated section is rendered with its own inline affordance
              row — approve / edit / request revision / reject — directly
              beneath the evidence that produced it. Disposition never leaves
              the section.
            </p>
            <div className="mt-2 flex items-center gap-3 font-mono text-mono-sm text-ink-3">
              <span>case {c.id}</span>
              <span>·</span>
              <span>{pendingCount} awaiting</span>
              <span>·</span>
              <span>{closedCount} closed</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
            <a
              href={`/case/${c.id}`}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              Full memo
            </a>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_18rem]">
        {/* Main column — the gated sections, each with inline affordance. */}
        <div className="flex flex-col gap-5">
          {gatedSections.map((s) => {
            const affordance = buildAffordance(s, c.id);
            const isFocus = s.id === focusSectionId;
            const sidebar =
              s.id === "final" ? (
                <RuleVerdictPanel verdicts={RULE_VERDICTS} />
              ) : undefined;
            return (
              <div
                key={s.id}
                data-focus={isFocus ? "true" : undefined}
                className={
                  isFocus
                    ? "rounded-md ring-2 ring-accent ring-offset-2 ring-offset-paper"
                    : ""
                }
              >
                <MemoSection
                  section={s}
                  affordance={affordance}
                  sidebar={sidebar}
                />
              </div>
            );
          })}
        </div>

        {/* Right rail — section anchor nav. */}
        <aside className="flex flex-col gap-4">
          <SectionNav sections={gatedSections} />
        </aside>
      </div>
    </AppShell>
  );
}
