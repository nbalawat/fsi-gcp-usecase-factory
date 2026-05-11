import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  RegulatoryClock,
  StatCard,
  StatusBadge,
  WorkflowStageRail,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { ExecutiveDecisionCard } from "../../../components/ExecutiveDecisionCard";
import { GatePillRow } from "../../../components/GatePillRow";
import {
  CANVAS_SHA256,
  COMPLIANCE_SCOPE,
  MODEL_PROVIDER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  gateStates,
  getCase,
  railStages,
  signalSnapshot,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

// Banker-readable rule labels (no business logic — just renaming).
const RULE_LABEL: Record<string, string> = {
  dscr_threshold_by_industry: "DSCR",
  leverage_threshold_by_industry: "Leverage",
  single_borrower_exposure: "Single-borrower",
  reg_o_individual_limit: "Reg O",
};

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "This case", icon: "inbox" },
  { id: "approval", label: "Approvals", icon: "activity", href: "/approval/SAMPLE" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const gates = gateStates(c.events, c.hitl_gates);
  const sig = signalSnapshot(c);
  const stages = railStages(c);
  const approvalHref = `/approval/${c.id}`;

  // The exec view's three KPIs only — anything beyond three breaks the
  // sparse axis. Verbatim from the case record / signal snapshot.
  const metrics: Metric[] = [
    {
      id: "exposure",
      label: "Exposure ($M)",
      value: "25",
      unit: "M",
      tooltip: "Requested facility size",
    },
    {
      id: "decision",
      label: "AI recommendation",
      value: c.decision,
      state: c.decision === "approve" ? "ok" : "warning",
    },
    {
      id: "gates",
      label: "Gates decided",
      value: `${sig.gatesDecided} / ${sig.gatesTotal}`,
      state: sig.gatesDecided === sig.gatesTotal ? "ok" : "warning",
    },
  ];

  // Pre-shaped one-sentence rationale (no decision math in components).
  const rationale =
    "DSCR and leverage both pass for NAICS 33 industrials; rater placed the credit at a 1-pass band; single-borrower exposure on watch — Reg O clean.";

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Executive view"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER} · ${COMPLIANCE_SCOPE} scope`}
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

      {/* The thin top stage rail — process metaphor, compressed. */}
      <WorkflowStageRail stages={stages} currentStage={c.current_stage} />

      {/* Three KPIs — the only "dashboard" surface on this page. */}
      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_14rem]">
        {/* The ARTIFACT — the decision card IS the page. */}
        <div className="flex flex-col gap-4">
          <ExecutiveDecisionCard
            c={c}
            signal={sig}
            rationaleSentence={rationale}
            authority="Chief Credit Officer"
            recommendation={c.decision.toUpperCase()}
          />

          {/* Gates pill row — one line, four pills, links to /approval. */}
          <section
            aria-label="HITL gates"
            className="rounded-md border border-rule bg-paper px-6 py-4"
          >
            <div className="mb-3 flex items-baseline justify-between">
              <div className="font-mono text-xs uppercase tracking-wider text-ink-3">
                Human-in-the-loop gates
              </div>
              <a
                href={approvalHref}
                className="font-mono text-xs text-accent-pressed underline-offset-2 hover:underline"
              >
                Open approval flow
              </a>
            </div>
            <GatePillRow
              gates={gates}
              buildHref={(g) => `${approvalHref}?gate=${g}`}
            />
          </section>

          {/* Rule verdicts — one tiny row of inline badges. */}
          <section
            aria-label="Rule verdicts"
            className="rounded-md border border-rule bg-paper px-6 py-4"
          >
            <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
              Rule verdicts
            </div>
            <ul className="flex flex-wrap items-center gap-2">
              {SHARED_RULES.map((r) => {
                const v = RULE_VERDICTS[r] ?? "skip";
                return (
                  <li
                    key={r}
                    className="flex items-center gap-2 rounded-sm border border-rule bg-paper px-3 py-1.5"
                  >
                    <span className="font-mono text-sm text-ink-1">
                      {RULE_LABEL[r] ?? r}
                    </span>
                    <StatusBadge kind={verdictBadge(v)}>{v}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* The tiny right rail — clock, canvas pin. Nothing else. */}
        <aside className="flex flex-col gap-4">
          <RegulatoryClock
            startedAt={c.events[0]?.at ?? "2026-05-09T08:00:00.000Z"}
            deadline="2026-05-15T17:00:00.000Z"
            regulatoryRegime="SR 11-7 review window"
          />
          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · ${COMPLIANCE_SCOPE}`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
