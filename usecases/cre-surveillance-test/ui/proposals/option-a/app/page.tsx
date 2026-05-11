import * as React from "react";
import { AppShell, MetricStrip, type Metric, type NavItem } from "@fsi-bank/components";
import { GridHeatmap } from "../components/GridHeatmap";
import { BandLegend } from "../components/BandLegend";
import {
  CANVAS_SHA256,
  CASE_SHAPE,
  FACILITIES,
  MODEL_PROVIDER,
  USE_CASE_ID,
  shortUsd,
  tallyByBand,
} from "../lib/data";

/**
 * Home — the dense executive grid. The 2D facility × risk-dimension
 * heatmap IS the page; chrome compresses to the AppShell strip + a
 * tiny right rail. Designed for a 30-second scan.
 */
const NAV: NavItem[] = [
  { id: "grid", label: "Grid", icon: "layout-dashboard", href: "/" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function HomePage(): React.ReactElement {
  const bandTally = tallyByBand();
  const totalExposure = FACILITIES.reduce((s, f) => s + f.exposureUsd, 0);
  const watchCells =
    bandTally.find((b) => b.band === "2-special-mention")?.count ?? 0;
  const breachCells =
    (bandTally.find((b) => b.band === "3-substandard")?.count ?? 0) +
    (bandTally.find((b) => b.band === "4-doubtful")?.count ?? 0) +
    (bandTally.find((b) => b.band === "5-loss")?.count ?? 0);

  const metrics: Metric[] = [
    {
      id: "facilities",
      label: "Facilities",
      value: FACILITIES.length,
      tooltip: "Total facilities under surveillance",
    },
    {
      id: "exposure",
      label: "Exposure",
      value: shortUsd(totalExposure),
    },
    {
      id: "watch",
      label: "Watch cells",
      value: watchCells,
      state: watchCells > 0 ? "warning" : "ok",
    },
    {
      id: "breach",
      label: "Breach cells",
      value: breachCells,
      state: breachCells > 0 ? "alert" : "ok",
    },
    {
      id: "case",
      label: "Aggregated case",
      value: CASE_SHAPE.canonical_id,
      tooltip: CASE_SHAPE.title,
    },
  ];

  return (
    <AppShell
      brand="CRE surveillance"
      subtitle="Executive grid"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="grid"
    >
      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-4 lg:grid-cols-4">
        {/* Grid — 3/4 of the width on lg+; full width below. */}
        <div className="lg:col-span-3">
          <GridHeatmap />
        </div>

        {/* Tiny right rail — band legend + canvas pin. */}
        <aside className="flex flex-col gap-4 lg:col-span-1">
          <BandLegend />
          <section className="rounded-md border border-rule bg-paper px-3 py-2">
            <div className="eyebrow">Canvas SHA-256</div>
            <p className="mt-1 break-all font-mono text-mono-sm text-ink-2">
              {CANVAS_SHA256.substring(0, 16)}…
            </p>
            <p className="mt-2 font-mono text-mono-sm text-ink-3">
              {CASE_SHAPE.primary_actor} · {CASE_SHAPE.decision_kind}
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
