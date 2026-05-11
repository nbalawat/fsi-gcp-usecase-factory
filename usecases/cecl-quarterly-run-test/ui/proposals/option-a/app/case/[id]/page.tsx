import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  RegulatoryClock,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { RunHero } from "../../../components/RunHero";
import { RailAnnotations } from "../../../components/RunStageRail";
import { StageDrill } from "../../../components/StageDrill";
import {
  USE_CASE_ID,
  MODEL_PROVIDER,
  buildLedger,
  buildRail,
  fmtUsdM,
  gateStates,
  getRun,
  SHARED_RULES,
  RULE_VERDICTS,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "runs", label: "Runs", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "This run", icon: "activity" },
  { id: "models", label: "Models", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

const RULE_LABEL: Record<string, string> = {
  single_borrower_exposure: "Single-borrower exposure",
  dscr_threshold_by_industry: "DSCR threshold",
  leverage_threshold_by_industry: "Leverage threshold",
  reg_o_individual_limit: "Reg O individual limit",
  cecl_reserve_floor_by_band: "CECL reserve floor by band",
};

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

/**
 * Run-detail surface (one quarter). Layout, top-to-bottom:
 *   1. AppShell + breadcrumb (shared chrome)
 *   2. RunHero — sparse, three numbers
 *   3. RegulatoryClock + MetricStrip
 *   4. The four-stage rail — CLICK A STAGE to switch the ledger below
 *   5. RailAnnotations — owner / caption / status under each stage
 *   6. SegmentLedger — segments × periods × bps (dense)
 *   7. Right rail: gate ledger + rule verdicts
 */
export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const run = getRun(params.id);
  const stages = buildRail(run.events);
  const ledger = buildLedger(run.borrowers);
  const gates = gateStates(run.events, run.hitl_gates);

  // The "active" stage on first paint = first non-done stage (so the
  // executive lands on the stage the run is currently doing).
  const initialActive =
    stages.find((s) => s.status !== "done")?.id ?? "cfo_attestation";

  const metrics: Metric[] = [
    { id: "alw", label: "Total allowance", value: fmtUsdM(run.totalAllowance_usd_m) },
    { id: "qoq", label: "QoQ delta", value: `+${fmtUsdM(run.qoqDelta_usd_m)}`, state: run.qoqDelta_usd_m > 1 ? "warning" : "ok" },
    { id: "exc", label: "Exceptions", value: run.exceptionCount, state: run.exceptionCount > 2 ? "warning" : "ok" },
    { id: "seg", label: "Segments", value: ledger.length },
    { id: "gate", label: "Gates decided", value: `${gates.filter((g) => g.status === "completed").length} / ${gates.length}` },
  ];

  const approvalHref = `/approval/${run.id}`;

  return (
    <AppShell
      brand="CECL · Quarterly run"
      subtitle="Executive view"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CECL · Quarterly run"
        caseId={run.id}
        borrowerName={run.period}
        backHref="/"
        backLabel="All runs"
      />

      <RunHero run={run} />

      <section
        aria-label="Regulatory clock and KPIs"
        className="grid gap-4 border-b border-rule px-6 py-5 lg:grid-cols-[24rem_1fr]"
      >
        <RegulatoryClock
          startedAt={run.occClockStartedAt}
          deadline={run.occDeadlineAt}
          regulatoryRegime="OCC 30-day ALLL"
          now={new Date(run.events[run.events.length - 1]?.at ?? Date.now())}
          amberAtHoursRemaining={7 * 24}
          redAtHoursRemaining={48}
        />
        <div className="self-stretch">
          <MetricStrip metrics={metrics} />
        </div>
      </section>

      <RailAnnotations stages={stages} />

      {/* The dense ledger surface — interactive stage selector. */}
      <StageDrill stages={stages} ledger={ledger} initialStageId={initialActive} />

      {/* Bottom rail: HITL gates + rule verdicts + CTA to attestation. */}
      <section className="grid gap-4 px-6 py-6 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-md border border-rule bg-paper">
          <header className="flex items-center justify-between border-b border-rule px-4 py-3">
            <div>
              <div className="eyebrow">HITL gates</div>
              <h3 className="font-serif text-h4 font-semi text-ink-1">
                Approval ledger
              </h3>
            </div>
            <Link
              href={approvalHref}
              className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:opacity-90"
            >
              Open CFO attestation →
            </Link>
          </header>
          <ul className="divide-y divide-rule">
            {gates.map((g) => (
              <li
                key={g.id}
                className="grid grid-cols-[1fr_8rem_10rem] items-center gap-3 px-4 py-3"
              >
                <span className="text-ui text-ink-1">{g.label}</span>
                <StatusBadge
                  kind={
                    g.status === "completed"
                      ? "success"
                      : g.status === "pending"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {g.status}
                </StatusBadge>
                <span className="text-right font-mono text-mono-sm text-ink-3">
                  {g.decidedAt
                    ? g.decidedAt.replace("T", " ").slice(0, 19) + " UTC"
                    : g.status === "pending"
                      ? "awaiting reviewer"
                      : "queued"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <aside
          aria-label="Rule verdicts"
          className="rounded-md border border-rule bg-paper"
        >
          <header className="border-b border-rule px-4 py-3">
            <div className="eyebrow">Rules engine</div>
            <h3 className="font-serif text-h4 font-semi text-ink-1">Verdicts</h3>
          </header>
          <ul className="divide-y divide-rule">
            {SHARED_RULES.map((r) => {
              const v = RULE_VERDICTS[r] ?? "skip";
              return (
                <li
                  key={r}
                  className="flex items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="text-ui text-ink-1">
                    {RULE_LABEL[r] ?? r}
                  </span>
                  <StatusBadge kind={verdictBadge(v)}>{v}</StatusBadge>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-2 px-4 py-3">
              <span className="text-ui text-ink-1">
                {RULE_LABEL["cecl_reserve_floor_by_band"]}
              </span>
              <StatusBadge kind="warning">watch</StatusBadge>
            </li>
          </ul>
        </aside>
      </section>
    </AppShell>
  );
}
