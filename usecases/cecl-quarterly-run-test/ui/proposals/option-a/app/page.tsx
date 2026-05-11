import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  RegulatoryClock,
  StatCard,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import { RunStageRail, RailAnnotations } from "../components/RunStageRail";
import { StageDrillHomeHint } from "../components/StageDrillHomeHint";
import {
  USE_CASE_ID,
  MODEL_PROVIDER,
  buildRail,
  fmtUsdM,
  getRun,
  listRuns,
} from "../lib/data";

const NAV: NavItem[] = [
  { id: "runs", label: "Runs", icon: "layout-dashboard", href: "/" },
  { id: "exceptions", label: "Exceptions", icon: "activity" },
  { id: "models", label: "Models", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

/**
 * Home — the all-runs index. Density is deliberately sparse: one
 * card per run, big numbers, the OCC clock as the only chromatic
 * affordance. The four-stage rail of the current run sits below
 * the hero so the executive sees "what's the state of THIS quarter"
 * at first glance.
 */
export default function HomePage(): React.ReactElement {
  const runs = listRuns();
  const live = getRun("");
  const stages = buildRail(live.events);

  return (
    <AppShell
      brand="CECL · Quarterly run"
      subtitle="Executive view"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="runs"
    >
      {/* Sparse hero — one row, three numbers, one regulatory clock.
          The clock IS the page's emotional anchor. */}
      <header className="grid gap-6 border-b border-rule bg-paper px-6 py-8 lg:grid-cols-[1fr_22rem]">
        <div>
          <div className="eyebrow">CECL allowance · {live.period}</div>
          <h1 className="mt-1 font-serif text-h1 font-semi text-ink-1">
            One number, signed by the CFO.
          </h1>
          <p className="mt-3 max-w-xl text-body text-ink-3">
            Four stages between this run and the SEC 10-Q. The rail below
            shows where the run is; click any stage to read the dense
            numeric ledger (segments × periods × bps).
          </p>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <StatCard
              label="Total allowance"
              value={fmtUsdM(live.totalAllowance_usd_m)}
              delta={`+${fmtUsdM(live.qoqDelta_usd_m)} QoQ`}
              tone={live.qoqDelta_usd_m > 1 ? "warning" : "neutral"}
            />
            <StatCard
              label="Exceptions"
              value={live.exceptionCount}
              unit="flagged"
              delta="qual-overlay required"
              tone={live.exceptionCount > 2 ? "warning" : "ok"}
            />
            <StatCard
              label="Run status"
              value={live.runStatus === "on-track" ? "On track" : live.runStatus === "watch" ? "Watch" : "At risk"}
              unit=""
              delta="stage 3 of 4"
              tone={live.runStatus === "on-track" ? "ok" : "warning"}
            />
          </div>
        </div>

        <RegulatoryClock
          startedAt={live.occClockStartedAt}
          deadline={live.occDeadlineAt}
          regulatoryRegime="OCC 30-day ALLL"
          now={new Date(live.events[live.events.length - 1]?.at ?? Date.now())}
          amberAtHoursRemaining={7 * 24}
          redAtHoursRemaining={48}
        />
      </header>

      {/* The stage rail IS the page. Clicks navigate into the run detail
          surface anchored to the chosen stage. */}
      <RunStageRail
        stages={stages}
        activeId="exception_review"
        navigateCaseId={live.id}
      />
      <RailAnnotations stages={stages} />
      <StageDrillHomeHint caseId={live.id} />

      {/* All runs — sparse list, one row each, only the live one gets
          interactive affordance (deep link to the case). */}
      <section aria-label="All quarterly runs" className="px-6 py-8">
        <h2 className="font-serif text-h3 font-semi text-ink-1">
          All quarterly runs
        </h2>
        <ul className="mt-4 divide-y divide-rule rounded-md border border-rule">
          {runs.map((r) => {
            const isLive = r.status !== "published";
            return (
              <li key={r.id} className="grid grid-cols-12 items-center gap-3 px-4 py-4">
                <div className="col-span-3">
                  <div className="font-serif text-h4 font-semi text-ink-1">
                    {r.period}
                  </div>
                  <div className="font-mono text-mono-sm text-ink-3">{r.id}</div>
                </div>
                <div className="col-span-2 text-right tabular-nums font-mono">
                  <div className="text-ink-1">{fmtUsdM(r.totalAllowance_usd_m)}</div>
                  <div className="eyebrow">allowance</div>
                </div>
                <div className="col-span-2 text-right tabular-nums font-mono">
                  <div className="text-ink-2">
                    {r.qoqDelta_usd_m >= 0 ? "+" : "-"}
                    {fmtUsdM(Math.abs(r.qoqDelta_usd_m))}
                  </div>
                  <div className="eyebrow">QoQ</div>
                </div>
                <div className="col-span-2 text-right tabular-nums font-mono">
                  <div className="text-ink-2">{r.exceptions}</div>
                  <div className="eyebrow">exceptions</div>
                </div>
                <div className="col-span-2 text-center">
                  {r.status === "published" ? (
                    <StatusBadge kind="neutral">filed</StatusBadge>
                  ) : r.status === "at-risk" ? (
                    <StatusBadge kind="danger">at risk</StatusBadge>
                  ) : r.status === "watch" ? (
                    <StatusBadge kind="warning">watch</StatusBadge>
                  ) : (
                    <StatusBadge kind="success">on track</StatusBadge>
                  )}
                </div>
                <div className="col-span-1 text-right">
                  {isLive ? (
                    <Link
                      href={`/case/${r.id}`}
                      className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:opacity-90"
                    >
                      Open →
                    </Link>
                  ) : (
                    <span className="font-mono text-mono-sm text-ink-3">
                      {r.filedAt?.slice(0, 10)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
