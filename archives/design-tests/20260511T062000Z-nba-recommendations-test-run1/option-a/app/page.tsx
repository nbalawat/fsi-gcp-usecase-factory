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
import { QueueTable } from "../components/QueueTable";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  USE_CASE_ID,
  buildQueue,
  fmtUsdCompact,
  queueKpis,
} from "../lib/data";

const NAV: NavItem[] = [
  { id: "queue", label: "Queue", icon: "inbox" },
  { id: "sent", label: "Sent today", icon: "activity" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

/**
 * Home / queue — the queue IS the page (Option A: density-axis).
 *
 * 50-200 recommendations are surfaced as a dense table; the RM
 * triages inline. Per-row buttons (Accept / Snooze / Dismiss) do
 * the reversible work on the row. The irrevocable "Send to
 * customer" action routes the RM through /approval/[id] (the
 * shared ApprovalGate primitive).
 */
export default function QueuePage(): React.ReactElement {
  const recs = buildQueue();
  const k = queueKpis(recs);

  const metrics: Metric[] = [
    {
      id: "pending",
      label: "Pending",
      value: k.pending,
      state: k.pending > 5 ? "warning" : "ok",
      tooltip: "Recommendations awaiting your disposition",
    },
    {
      id: "expiring",
      label: "Expiring < 48h",
      value: k.expiringSoon,
      state: k.expiringSoon > 0 ? "alert" : "ok",
    },
    {
      id: "accepted",
      label: "Accepted today",
      value: k.accepted,
    },
    {
      id: "snoozed",
      label: "Snoozed",
      value: k.snoozed,
    },
    {
      id: "pipeline",
      label: "Uplift pipeline",
      value: fmtUsdCompact(k.uplift_pipeline_usd),
      unit: "/ yr",
      tooltip: "Estimated annualised uplift of pending + accepted",
    },
  ];

  return (
    <AppShell
      brand="Next-best-action"
      subtitle="RM queue · dense triage"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="queue"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Next-best-action"
        backHref="/"
        backLabel="Queue"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Today · Branch Banker</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              Recommendations queue
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-3">
              {k.pending} pending · {k.expiringSoon} expiring soon. Each
              row is a complete unit — disposition inline; drill-in only
              when you need the rationale and the agent trail.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="info">stage: presented</StatusBadge>
            <StatusBadge kind="accent">canvas pinned</StatusBadge>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_18rem]">
        <QueueTable recs={recs} />

        <aside className="flex flex-col gap-4">
          <StatCard
            label="Throughput target"
            value={50}
            unit="/ day"
            delta={`${k.accepted + k.dismissed + k.snoozed} dispositioned so far`}
            tone="ok"
          />
          <StatCard
            label="Accept rate"
            value={
              k.accepted + k.dismissed > 0
                ? `${Math.round(
                    (k.accepted / (k.accepted + k.dismissed)) * 100,
                  )}%`
                : "—"
            }
            unit="(today)"
            delta="vs 28% bank baseline"
            tone="neutral"
          />
          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`use case ${USE_CASE_ID}`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
