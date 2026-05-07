import * as React from "react";

export interface Metric {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  /** -1 / 0 / +1 — drives the up/down/flat indicator */
  trend?: -1 | 0 | 1;
  /** Set to "alert" if value crosses an alert threshold (red tint) */
  state?: "ok" | "alert" | "warning";
  tooltip?: string;
}

export interface MetricStripProps {
  metrics: Metric[];
}

const stateClasses: Record<NonNullable<Metric["state"]>, string> = {
  ok: "bg-surface-panel border-surface-border text-text-primary",
  warning: "bg-status-warningBg border-status-warning text-status-warning",
  alert: "bg-status-criticalBg border-status-critical text-status-critical",
};

const trendGlyph = (trend: Metric["trend"]): string => {
  if (trend === 1) return "▲";
  if (trend === -1) return "▼";
  return "·";
};

const trendClass = (trend: Metric["trend"]): string => {
  if (trend === 1) return "text-status-ok";
  if (trend === -1) return "text-status-critical";
  return "text-text-muted";
};

/**
 * KPI strip: 5 numbers across the top of every console.
 * Server component (no interactivity).
 */
export const MetricStrip: React.FC<MetricStripProps> = ({ metrics }) => {
  return (
    <div
      role="list"
      aria-label="Pipeline KPIs"
      className="grid grid-cols-2 gap-3 border-b border-surface-border bg-surface-canvas px-6 py-4 md:grid-cols-3 lg:grid-cols-5"
    >
      {metrics.map((m) => {
        const state: NonNullable<Metric["state"]> = m.state ?? "ok";
        return (
          <div
            key={m.id}
            role="listitem"
            title={m.tooltip}
            className={`rounded-md border px-4 py-3 ${stateClasses[state]}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {m.label}
              </span>
              {m.trend !== undefined && (
                <span
                  aria-hidden
                  className={`text-xs ${trendClass(m.trend)}`}
                >
                  {trendGlyph(m.trend)}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">
                {m.value}
              </span>
              {m.unit && (
                <span className="text-sm text-text-muted">{m.unit}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
