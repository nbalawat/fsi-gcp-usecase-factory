import * as React from "react";

export type StatTone = "success" | "warning" | "danger" | "accent" | "neutral";

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
  /** Optional trailing icon / action, e.g. an info button. */
  trailing?: React.ReactNode;
}

const valueClass: Record<StatTone, string> = {
  danger: "text-semantic-danger",
  warning: "text-semantic-warning",
  success: "text-semantic-success",
  accent: "text-accent-pressed",
  neutral: "text-ink-1",
};

/**
 * Atrium stat tile. Used across persona homes as the headline numbers strip.
 * Banker English in the label, full numbers (or compact $) in the value,
 * one-line citation/context in the sub.
 */
export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  sub,
  tone = "neutral",
  trailing,
}) => (
  <div className="rounded-md border border-rule bg-paper p-4">
    <div className="flex items-start justify-between gap-2">
      <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
        {label}
      </p>
      {trailing}
    </div>
    <p
      className={
        "mt-1 font-serif text-h2 font-semi tabular-nums tracking-tight " +
        valueClass[tone]
      }
    >
      {value}
    </p>
    {sub && <p className="mt-0.5 text-mono-sm font-mono text-ink-3">{sub}</p>}
  </div>
);
