import * as React from "react";
import {
  AppShell,
  MetricStrip,
  StatCard,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { RiskMap } from "../components/RiskMap";
import {
  CANVAS_SHA256,
  FACILITIES,
  MODEL_PROVIDER,
  REGION_AGGREGATES,
  STATE_CLUSTERS,
  USE_CASE_ID,
  fmtUsd,
} from "../lib/data";

const NAV: NavItem[] = [
  { id: "map", label: "Risk map", icon: "layout-dashboard", href: "/" },
  { id: "watchlist", label: "Watchlist", icon: "activity" },
  { id: "approvals", label: "Approvals", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function HomePage(): React.ReactElement {
  const totalFacilities = FACILITIES.length;
  const watchFacilities = FACILITIES.filter((f) => f.watchlist).length;
  const totalExposure = FACILITIES.reduce((s, f) => s + f.exposureUsd, 0);
  const hottestRegion = REGION_AGGREGATES.slice().sort(
    (a, b) => b.heatLevel - a.heatLevel || b.watchCount - a.watchCount,
  )[0];

  const metrics: Metric[] = [
    {
      id: "facilities",
      label: "Facilities",
      value: totalFacilities,
      tooltip: "Total CRE facilities under surveillance",
    },
    {
      id: "watch",
      label: "On watch",
      value: watchFacilities,
      state: watchFacilities > 0 ? "warning" : "ok",
      tooltip: "Facilities with risk band > 1-pass",
    },
    {
      id: "hot",
      label: "Hottest region",
      value: hottestRegion?.region ?? "—",
      state: (hottestRegion?.heatLevel ?? 0) >= 2 ? "warning" : "ok",
    },
    {
      id: "exposure",
      label: "Total exposure",
      value: fmtUsd(totalExposure),
    },
    {
      id: "provider",
      label: "Model provider",
      value: MODEL_PROVIDER,
    },
  ];

  return (
    <AppShell
      brand="CRE Surveillance"
      subtitle="Map of risk"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="map"
    >
      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-3">
        {/* Main column — the map IS the page (2/3 of the grid). */}
        <div className="lg:col-span-2">
          <RiskMap regions={REGION_AGGREGATES} clusters={STATE_CLUSTERS} />
        </div>

        {/* Side rail — context, not navigation. */}
        <aside className="flex flex-col gap-4">
          <StatCard
            label="Top regional concentration"
            value={hottestRegion?.region ?? "—"}
            unit={`${hottestRegion?.watchCount ?? 0} watch`}
            delta={`${hottestRegion?.facilityCount ?? 0} facilities · ${fmtUsd(hottestRegion?.totalExposureUsd ?? 0)}`}
            tone={
              (hottestRegion?.heatLevel ?? 0) >= 3
                ? "danger"
                : (hottestRegion?.heatLevel ?? 0) >= 2
                  ? "warning"
                  : "ok"
            }
            spark={REGION_AGGREGATES.map((r) => r.watchCount)}
          />

          <StatCard
            label="Total CRE exposure"
            value={fmtUsd(totalExposure)}
            unit="USD"
            delta={`${totalFacilities} facilities`}
            tone="neutral"
            spark={STATE_CLUSTERS.map((s) => s.totalExposureUsd / 1_000_000_000)}
          />

          <section
            aria-label="Map legend"
            className="rounded-md border border-rule bg-paper p-3"
          >
            <div className="eyebrow mb-2">Heat legend</div>
            <ul className="flex flex-col gap-1.5 text-mono-sm">
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-6 rounded-sm bg-paper-2 border border-rule" />
                <span className="text-ink-2">0 — no watch</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-6 rounded-sm bg-semantic-info-tint" />
                <span className="text-ink-2">1 — low (&lt;15%)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-6 rounded-sm bg-semantic-warning-tint" />
                <span className="text-ink-2">2 — moderate (15–30%)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-6 rounded-sm bg-semantic-danger-tint" />
                <span className="text-ink-2">3 — elevated (30–50%)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-6 rounded-sm bg-riskBand-5-loss" />
                <span className="text-ink-2">4 — severe (&gt;50%)</span>
              </li>
            </ul>
          </section>

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${USE_CASE_ID} · surveillance`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
