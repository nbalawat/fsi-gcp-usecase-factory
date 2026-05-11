import * as React from "react";
import { StatCard } from "@fsi-bank/components";
import type { LiveKpi } from "../lib/data";

/**
 * Option A's "invisible chrome" KPI band — exactly THREE numbers, the
 * three the Fraud Ops Lead actually watches:
 *
 *   1. Rolling decline-rate (%)
 *   2. P99 agent latency (ms)
 *   3. Model drift gauge (0..1)
 *
 * The strip uses the shared StatCard primitive so the visual language
 * matches every other console. Sparse-density: each tile is ~80px tall,
 * tabular-nums, no chrome.
 *
 * Server component — pure render of pre-aggregated KPI numbers; no
 * interactivity, no business logic.
 */
export interface KpiHeaderProps {
  kpi: LiveKpi;
}

export const KpiHeader: React.FC<KpiHeaderProps> = ({ kpi }) => {
  return (
    <section
      aria-label="Live fraud KPIs"
      className="grid grid-cols-1 gap-3 border-b border-rule bg-paper-2 px-6 py-3 md:grid-cols-3"
    >
      <StatCard
        label="Rolling decline rate"
        value={kpi.decline_rate_pct.toFixed(2)}
        unit="%"
        delta={`${kpi.declined} of ${kpi.total} in window`}
        tone={kpi.decline_rate_pct >= 5 ? "warning" : "neutral"}
      />
      <StatCard
        label="P99 agent latency"
        value={kpi.p99_latency_ms}
        unit="ms"
        delta="Vertex · gemini-3-1-flash"
        tone={kpi.p99_latency_ms >= 800 ? "warning" : "ok"}
      />
      <StatCard
        label="Model drift gauge"
        value={kpi.drift_score.toFixed(2)}
        unit="ratio"
        delta="tokens_out / tokens_in"
        tone={kpi.drift_score >= 0.5 ? "warning" : "neutral"}
      />
    </section>
  );
};
