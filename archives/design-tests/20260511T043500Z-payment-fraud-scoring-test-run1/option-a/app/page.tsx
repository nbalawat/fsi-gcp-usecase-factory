import * as React from "react";
import {
  AppShell,
  type NavItem,
} from "@fsi-bank/components";
import { KpiHeader } from "../components/KpiHeader";
import { DecisionStream } from "../components/DecisionStream";
import {
  CANVAS_SHA256,
  DECISION_STREAM,
  MODEL_PROVIDER,
  USE_CASE_ID,
  liveKpi,
} from "../lib/data";

const NAV: NavItem[] = [
  { id: "floor",   label: "Live floor",        icon: "radio",            href: "/" },
  { id: "stepup",  label: "Step-up queue",     icon: "inbox",            href: "/approval/CHL-0001" },
  { id: "rules",   label: "Velocity rules",    icon: "git-branch" },
  { id: "drift",   label: "Model drift",       icon: "activity" },
];

export default function HomePage(): React.ReactElement {
  const kpi = liveKpi(DECISION_STREAM);
  const counts = {
    all: DECISION_STREAM.length,
    approve: kpi.approved,
    decline: kpi.declined,
    stepUp: kpi.stepUp,
  };

  return (
    <AppShell
      brand="Payment fraud"
      subtitle="Live floor"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER} · canvas ${CANVAS_SHA256.substring(0, 8)}`}
      nav={NAV}
      active="floor"
    >
      {/* Sparse header — 3 numbers, no chrome. */}
      <KpiHeader kpi={kpi} />

      {/* The page IS the stream. No second column, no aside, no padding. */}
      <DecisionStream rows={DECISION_STREAM} counts={counts} />

      <footer className="border-t border-rule bg-paper-2 px-6 py-2 font-mono text-mono-sm text-ink-3">
        <span className="eyebrow">option A · density 1 · throughput</span>
        <span className="ml-3">canvas {CANVAS_SHA256.substring(0, 12)}…</span>
      </footer>
    </AppShell>
  );
}
