import * as React from "react";

/**
 * SHARED PRIMITIVE — inlined copy of ui/packages/components/src/MetricStrip.tsx
 * Source: shared. Server component (no interactivity).
 */
export interface Metric {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  trend?: -1 | 0 | 1;
  state?: "ok" | "alert" | "warning";
  tooltip?: string;
}

export interface MetricStripProps {
  metrics: Metric[];
}

const stateClasses: Record<NonNullable<Metric["state"]>, string> = {
  ok: "bg-paper border-rule text-ink-1",
  warning: "bg-semantic-warningTint border-semantic-warning text-semantic-warning",
  alert: "bg-semantic-dangerTint border-semantic-danger text-semantic-danger",
};

const trendGlyph = (trend: Metric["trend"]): string => {
  if (trend === 1) return "▲";
  if (trend === -1) return "▼";
  return "·";
};

const trendClass = (trend: Metric["trend"]): string => {
  if (trend === 1) return "text-semantic-success";
  if (trend === -1) return "text-semantic-danger";
  return "text-ink-3";
};

export const MetricStrip: React.FC<MetricStripProps> = ({ metrics }) => {
  return (
    <div
      role="list"
      aria-label="Book KPIs"
      className="grid grid-cols-2 gap-3 border-b border-rule bg-paper-2 px-6 py-4 md:grid-cols-3 lg:grid-cols-5"
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
              <span className="text-xs font-medium uppercase tracking-wide text-ink-3">
                {m.label}
              </span>
              {m.trend !== undefined && (
                <span aria-hidden className={`text-xs ${trendClass(m.trend)}`}>
                  {trendGlyph(m.trend)}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">
                {m.value}
              </span>
              {m.unit && (
                <span className="text-sm text-ink-3">{m.unit}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
