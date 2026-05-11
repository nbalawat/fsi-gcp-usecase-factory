import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  RegulatoryClock,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { RunOverviewClient } from "../components/RunOverviewClient";
import { MethodologyOwnerRail } from "../components/MethodologyOwnerRail";
import {
  AUDITOR_CANVAS_SHA256,
  BORROWERS,
  HITL_GATES,
  LIVE_CASE,
  MODEL_PROVIDER,
  USE_CASE_ID,
  getRun,
  gateStates,
  methodologyOwnerStats,
  runTotals,
  runWindow,
  toSegmentRows,
  fmtCurrency,
  fmtPctBps,
} from "../lib/data";

const NAV: NavItem[] = [
  { id: "live", label: "Run overview", icon: "layout-dashboard", href: "/" },
  {
    id: "case",
    label: "Run detail",
    icon: "workflow",
    href: `/case/${LIVE_CASE.id}`,
  },
  {
    id: "approval",
    label: "CFO attest",
    icon: "inbox",
    href: `/approval/${LIVE_CASE.id}`,
  },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

/**
 * Home — the Q2 CECL run overview. Per the affordance axis, each segment
 * row LISTS its inputs + its computed reserve + ENDS with the action it
 * enables. No modal, no bottom-bar, no separate review screen. The user
 * disposes of segment methodology approval on the row that triggered it.
 *
 * The ONE action that escapes inline is CFO attestation — irrevocable, it
 * lives on /approval. The header CTA only unlocks when all reversible
 * segment approvals are recorded.
 */
export default function HomePage(): React.ReactElement {
  const c = getRun(LIVE_CASE.id);
  const segments = toSegmentRows(BORROWERS);
  const totals = runTotals(segments);
  const ownerStats = methodologyOwnerStats(segments);
  const gates = gateStates(c.events, c.hitl_gates);
  const window = runWindow(c.events);

  const metrics: Metric[] = [
    {
      id: "allowance",
      label: "Proposed allowance",
      value: fmtCurrency(totals.totalEcl),
      tooltip: "Sum of segment ECL across the Q2 run",
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
      id: "ready",
      label: "Ready to approve",
      value: totals.readyCount,
      state: totals.readyCount > 0 ? "warning" : "ok",
    },
  ];

  const segmentGate = gates.find((g) => g.name === "approve_segment_methodology");
  const cfoGate = gates.find((g) => g.name === "cfo_attest_run");
  const approvalHref = `/approval/${c.id}`;

  return (
    <AppShell
      brand="CECL Q2 close"
      subtitle="Run console · inline action"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="live"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CECL quarterly run"
        stage={c.current_stage}
        caseId={c.id}
        backHref="/"
        backLabel="Run overview"
      />

      {/* Hero — the run identity, badges, and the variance/ready signal */}
      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">FASB ASC 326 · quarterly close</div>
            <h1 className="font-serif text-h1 font-semi tracking-tight text-ink-1">
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
              kind={
                segmentGate?.status === "completed"
                  ? "success"
                  : segmentGate?.status === "pending"
                    ? "warning"
                    : "neutral"
              }
            >
              segment-methodology: {segmentGate?.status ?? "queued"}
            </StatusBadge>
            <StatusBadge
              kind={
                cfoGate?.status === "completed"
                  ? "success"
                  : cfoGate?.status === "pending"
                    ? "warning"
                    : "neutral"
              }
            >
              cfo-attest: {cfoGate?.status ?? "queued"}
            </StatusBadge>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      {/* Two-column body — segment rows take the bulk, owners + clock rail
           on the right. Rows ARE the page; rail is supporting context. */}
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_320px]">
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
          <section className="rounded-md border border-rule bg-paper p-4">
            <div className="eyebrow">Canvas pin</div>
            <div className="mt-1 font-mono text-mono-sm text-ink-1">
              {AUDITOR_CANVAS_SHA256.substring(0, 12)}…
            </div>
            <div className="mt-2 font-mono text-caption text-ink-3">
              {HITL_GATES.length} HITL gates · {MODEL_PROVIDER}
            </div>
            <a
              href={`/case/${c.id}`}
              className="mt-3 inline-block rounded-sm border border-rule px-3 py-1.5 font-mono text-mono-sm text-ink-1 hover:bg-paper-2"
            >
              Open run detail →
            </a>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
