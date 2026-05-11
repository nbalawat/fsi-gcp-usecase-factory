import * as React from "react";

export type StatTone = "neutral" | "ok" | "warning" | "danger";

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  spark?: number[];
  tone?: StatTone;
}

const toneColor: Record<StatTone, string> = {
  neutral: "var(--accent)",
  ok: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

const toneText: Record<StatTone, string> = {
  neutral: "text-ink-3",
  ok: "text-semantic-success",
  warning: "text-semantic-warning",
  danger: "text-semantic-danger",
};

/**
 * Stat card for headers. Big serif value · sparkline · delta.
 *
 * source: shared
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  delta,
  spark,
  tone = "neutral",
}) => (
  <div className="rounded-md border border-rule bg-paper p-4">
    <div className="eyebrow">{label}</div>
    <div className="mt-1.5 flex items-end justify-between gap-2">
      <div className="flex items-baseline gap-1">
        <span className="font-serif text-h1 font-semi leading-none tracking-tight text-ink-1">
          {value}
        </span>
        {unit && (
          <span className="font-mono text-mono-sm text-ink-3">{unit}</span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <Sparkline data={spark} color={toneColor[tone]} />
      )}
    </div>
    {delta && (
      <div className={`mt-2 font-mono text-mono-sm ${toneText[tone]}`}>
        {delta}
      </div>
    )}
  </div>
);

const Sparkline: React.FC<{
  data: number[];
  color: string;
  w?: number;
  h?: number;
}> = ({ data, color, w = 72, h = 24 }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} aria-hidden className="flex-shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
