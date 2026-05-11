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
import { HeatmapGrid } from "../components/HeatmapGrid";
import { DecisionStreamRail } from "../components/DecisionStreamRail";
import {
  CANVAS_CHECKSUM_PINNED,
  MODEL_PROVIDER,
  USE_CASE_ID,
  buildFiringStream,
  decisionTotals,
  tallyByCell,
} from "../lib/data";

const NAV: NavItem[] = [
  { id: "heatmap", label: "Heatmap floor", icon: "layout-dashboard", href: "/" },
  { id: "stream",  label: "Decision stream", icon: "activity" },
  { id: "rules",   label: "Rules",        icon: "git-branch" },
  { id: "agent",   label: "Agent",        icon: "bot" },
];

export default function HomePage(): React.ReactElement {
  // Server-rendered home — deterministic data from the shared module.
  // No randomness, no per-request state. Live updates would arrive via
  // SSE in production; for the design proposal the stream is fixed.
  const stream = buildFiringStream();
  const cells = tallyByCell(stream);
  const totals = decisionTotals(stream);

  // Decision-share metrics — display only. The agent owns the
  // decisions; this component is forbidden from computing or
  // re-deriving them.
  const metrics: Metric[] = [
    {
      id: "throughput",
      label: "Firings (sample window)",
      value: totals.total,
    },
    {
      id: "approve",
      label: "Approve",
      value: totals.approve,
      state: "ok",
    },
    {
      id: "stepup",
      label: "Step-up",
      value: totals.stepUp,
      state: "warning",
    },
    {
      id: "decline",
      label: "Decline",
      value: totals.decline,
      state: "danger",
    },
    {
      id: "worst",
      label: "Worst score",
      value: totals.worstScore,
      state: totals.worstScore >= 70 ? "danger" : totals.worstScore >= 40 ? "warning" : "ok",
    },
    {
      id: "avg",
      label: "Avg score",
      value: totals.avgScore,
    },
  ];

  return (
    <AppShell
      brand="Payment fraud scoring"
      subtitle="Feature × MCC heatmap"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="heatmap"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Payment fraud scoring"
        backHref="/"
        backLabel="Heatmap floor"
      />

      {/* Hero — the firing population is the page. */}
      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Firing population</div>
            <h1 className="font-serif text-3xl font-semibold text-ink-1">
              What is the model firing on right now?
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-3">
              Each cell is one (feature × merchant-category) pair. The
              number is the count of non-approve firings; intensity is
              the population heat. Click a cell to drill into the
              transactions that lit it up.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="info">stage: live</StatusBadge>
            <StatusBadge kind="neutral">
              {totals.total} firings shown
            </StatusBadge>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        {/* Main column — the heatmap is the page. */}
        <HeatmapGrid
          cells={cells}
          buildEventHref={(id) => `/event/${id}`}
        />

        {/* Right rail — live decision stream + canvas pin. */}
        <aside className="flex flex-col gap-4">
          <DecisionStreamRail
            events={stream}
            limit={10}
            buildHref={(id) => `/event/${id}`}
          />

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_CHECKSUM_PINNED.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · ${USE_CASE_ID}`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
