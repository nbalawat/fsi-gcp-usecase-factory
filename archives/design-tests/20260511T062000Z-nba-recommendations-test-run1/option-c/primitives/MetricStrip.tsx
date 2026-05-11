import * as React from "react";

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

/**
 * KPI strip: numbers across the top of the page. Server component.
 *
 * source: shared
 */
export const MetricStrip: React.FC<MetricStripProps> = ({ metrics }) => {
  return (
    <div
      role="list"
      aria-label="Queue KPIs"
      className="grid grid-cols-2 gap-3 border-b border-rule bg-paper px-6 py-4 md:grid-cols-3 lg:grid-cols-5"
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
              <span className="eyebrow">{m.label}</span>
              {m.trend !== undefined && (
                <span
                  aria-hidden
                  className={`text-mono-sm ${trendClass(m.trend)}`}
                >
                  {trendGlyph(m.trend)}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-serif text-h2 font-semi tabular-nums">
                {m.value}
              </span>
              {m.unit && (
                <span className="font-mono text-mono-sm text-ink-3">{m.unit}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
