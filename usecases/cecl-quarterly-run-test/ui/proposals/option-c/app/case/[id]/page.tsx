import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  RegulatoryClock,
  StatCard,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { RunOverviewClient } from "../../../components/RunOverviewClient";
import { MethodologyOwnerRail } from "../../../components/MethodologyOwnerRail";
import { AuditLedger } from "../../../components/AuditLedger";
import {
  AUDITOR_CANVAS_SHA256,
  BORROWERS,
  HITL_GATES,
  MODEL_PROVIDER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  getRun,
  gateStates,
  methodologyOwnerStats,
  runTotals,
  runWindow,
  toAuditRows,
  toSegmentRows,
  fmtCurrency,
  fmtPctBps,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "live", label: "Run overview", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "Run detail", icon: "workflow" },
  { id: "approval", label: "CFO attest", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

const RULE_LABEL: Record<string, string> = {
  single_borrower_exposure: "Single-borrower exposure",
  insider_aggregate_limit: "Insider aggregate limit",
  reg_o_individual_limit: "Reg O individual limit",
};

/**
 * Run-detail page. Same affordance pattern as the overview — segment rows
 * carry their inline actions — but augmented with full audit ledger and
 * rule-verdict surface so the analyst can drill into a single run.
 *
 * The CFO attestation CTA is still the only escape; segment-methodology
 * approvals all happen inline.
 */
export default function RunDetailPage({
  params,
}: PageProps): React.ReactElement {
  const c = getRun(params.id);
  const segments = toSegmentRows(BORROWERS);
  const totals = runTotals(segments);
  const ownerStats = methodologyOwnerStats(segments);
  const gates = gateStates(c.events, c.hitl_gates);
  const window = runWindow(c.events);
  const auditRows = toAuditRows(c.events);

  const metrics: Metric[] = [
    {
      id: "allowance",
      label: "Proposed allowance",
      value: fmtCurrency(totals.totalEcl),
    },
    {
      id: "segments",
      label: "Segments",
      value: totals.segmentCount,
    },
    {
      id: "weighted-pd",
      label: "Weighted PD",
      value: fmtPctBps(totals.weightedPdBps),
    },
    {
      id: "variance",
      label: "Variance Q&A",
      value: totals.varianceCount,
      state: totals.varianceCount > 0 ? "warning" : "ok",
    },
    {
      id: "events",
      label: "Pipeline events",
      value: c.events.length,
    },
  ];

  const approvalHref = `/approval/${c.id}`;

  return (
    <AppShell
      brand="CECL Q2 close"
      subtitle="Run detail · inline action"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CECL quarterly run"
        stage={c.current_stage}
        caseId={c.id}
        backHref="/"
        backLabel="Run overview"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">CECL run · {c.current_stage}</div>
            <h1 className="font-serif text-h1 font-semi text-ink-1">
              {c.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{c.id}</span>
              <span>·</span>
              <span>actor: {c.primary_actor}</span>
              <span>·</span>
              <span>{c.decision_kind}</span>
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
              href={approvalHref}
              className="rounded-sm bg-brandBlack px-3 py-1.5 font-mono text-mono-sm text-brandBlack-fg hover:bg-ink-2"
            >
              CFO attest →
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_360px]">
        {/* The run-overview client carries the segment rows AND the inline
             variance Q&A panel. Same client surface as the home page. */}
        <RunOverviewClient
          segments={segments}
          runId={c.id}
          totalEcl={totals.totalEcl}
          approvalHref={approvalHref}
          hitlGateCount={HITL_GATES.length}
        />

        <aside className="flex flex-col gap-4 border-t border-rule bg-paper-2 p-5 lg:border-l lg:border-t-0">
          <RegulatoryClock
            startedAt={window.startedAt}
            deadline={window.deadline}
            regulatoryRegime={window.regulatoryRegime}
            amberAtHoursRemaining={72}
            redAtHoursRemaining={24}
          />

          <MethodologyOwnerRail stats={ownerStats} />

          {/* Rule verdicts — small section, banker-vocabulary */}
          <section
            aria-label="Rule verdicts"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-4 py-2">
              <div className="eyebrow">Rules engine</div>
              <h3 className="font-serif text-h4 font-semi text-ink-1">
                Verdicts
              </h3>
            </header>
            <ul className="flex flex-col">
              {SHARED_RULES.length === 0 && (
                <li className="px-4 py-3 font-mono text-caption text-ink-3">
                  No shared rules in scope for this run.
                </li>
              )}
              {SHARED_RULES.map((r) => {
                const v = RULE_VERDICTS[r] ?? "skip";
                return (
                  <li
                    key={r}
                    className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2 last:border-b-0"
                  >
                    <span className="text-ui text-ink-1">
                      {RULE_LABEL[r] ?? r}
                    </span>
                    <StatusBadge kind={verdictBadge(v)}>{v}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          </section>

          <StatCard
            label="Canvas SHA-256"
            value={`${AUDITOR_CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${gates.length} HITL gate${gates.length === 1 ? "" : "s"} · ${MODEL_PROVIDER}`}
            tone="neutral"
          />
        </aside>
      </div>

      {/* Audit ledger spans full width below the segment-row grid */}
      <section className="border-t border-rule bg-paper-2 px-6 py-5">
        <AuditLedger rows={auditRows} />
      </section>
    </AppShell>
  );
}
