import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatCard,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { MemoSection } from "../../../components/MemoSection";
import { SectionAffordanceRow } from "../../../components/SectionAffordanceRow";
import { SectionNav } from "../../../components/SectionNav";
import { BorrowerFactSheet } from "../../../components/BorrowerFactSheet";
import { RuleVerdictPanel } from "../../../components/RuleVerdictPanel";
import {
  CANVAS_SHA256,
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
}

// Per-gate recommendations. Pre-shaped copy — the auditor disallows
// decision math inside components, so these literals come from the
// canvas's documented recommendation copy. The same map is used by the
// approval flow.
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
      "Rater-with-covenant produced a 1-pass band consistent with peer-and-industry-context and loan-serviceability. Single-borrower exposure is on watch — confirm the covenant package covers it.",
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

// Surface counts straight from the case record — display-only.
function summary(c: ReturnType<typeof getCase>): {
  agentCalls: number;
  serviceCalls: number;
  gatesDecided: number;
  gatesTotal: number;
} {
  let agentCalls = 0;
  let serviceCalls = 0;
  let gatesDecided = 0;
  for (const e of c.events) {
    if (e.kind === "agent_invoked") agentCalls += 1;
    if (e.kind === "service_invoked") serviceCalls += 1;
    if (e.kind === "human_action") gatesDecided += 1;
  }
  return {
    agentCalls,
    serviceCalls,
    gatesDecided,
    gatesTotal: c.hitl_gates.length,
  };
}

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "This case", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
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

export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const sections = partitionSections(c, RULE_VERDICTS);
  const sum = summary(c);

  const metrics: Metric[] = [
    { id: "sections", label: "Memo sections", value: sections.length },
    { id: "agent", label: "Agent reasonings", value: sum.agentCalls },
    { id: "service", label: "Service calls", value: sum.serviceCalls },
    {
      id: "gates",
      label: "Gates decided",
      value: `${sum.gatesDecided} / ${sum.gatesTotal}`,
      state: sum.gatesDecided === sum.gatesTotal ? "ok" : "warning",
    },
    { id: "stage", label: "Current stage", value: c.current_stage },
  ];

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Inline-per-section memo"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Commercial Credit"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref="/"
        backLabel="Live floor"
      />

      {/* Hero — case identity + the overall recommendation. */}
      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Case</div>
            <h1 className="font-serif text-2xl font-semibold text-ink-1">
              {c.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{c.id}</span>
              <span>·</span>
              <span>{c.borrower.name}</span>
              <span>·</span>
              <span>{c.borrower.geo}</span>
              <span>·</span>
              <span>NAICS {c.borrower.naics}</span>
              <span>·</span>
              <span>band {c.borrower.risk_band}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
            <StatusBadge
              kind={c.decision === "approve" ? "success" : "neutral"}
            >
              {c.decision}
            </StatusBadge>
            <a
              href={`/approval/${c.id}`}
              className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:bg-accent-hover"
            >
              Open approval flow
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_18rem]">
        {/* Main column — the memo as five inline-affordance sections. */}
        <div className="flex flex-col gap-5">
          {sections.map((s) => {
            const affordance = buildAffordance(s, c.id);
            if (s.id === "borrower") {
              return (
                <MemoSection key={s.id} section={s} affordance={affordance}>
                  <BorrowerFactSheet
                    borrower={c.borrower}
                    caseId={c.id}
                    title={c.title}
                  />
                </MemoSection>
              );
            }
            if (s.id === "final") {
              return (
                <MemoSection
                  key={s.id}
                  section={s}
                  affordance={affordance}
                  sidebar={<RuleVerdictPanel verdicts={RULE_VERDICTS} />}
                />
              );
            }
            return <MemoSection key={s.id} section={s} affordance={affordance} />;
          })}
        </div>

        {/* Right rail — anchor nav to each section + canvas pin. */}
        <aside className="flex flex-col gap-4">
          <SectionNav sections={sections} />
          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta="hybrid model · full compliance"
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
