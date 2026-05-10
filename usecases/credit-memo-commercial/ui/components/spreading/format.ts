/**
 * Formatters used across the spreading workbench. Centralized so the
 * raw column, normalized column, ratio strip, and CSV export all render
 * numbers identically.
 */

export function fmtUsd(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (opts.compact !== false) {
    if (abs >= 1_000_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000).toFixed(0)}k`;
  }
  return `${n < 0 ? "-" : ""}$${abs.toFixed(0)}`;
}

export function fmtSignedUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtUsd(n)}`;
}

export function fmtPct(n: number | null | undefined, fractionDigits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(fractionDigits)}%`;
}

export function fmtRatio(n: number | null | undefined, fractionDigits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(fractionDigits)}×`;
}

export function fmtDelta(prev: number | null | undefined, cur: number | null | undefined): string {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return "";
  if (prev === 0) return "";
  const d = (cur - prev) / Math.abs(prev);
  return `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`;
}

/**
 * Trend direction across two years for an arrow indicator.
 *  positive = the larger value is "better" (revenue, EBITDA, equity)
 *  negative = the larger value is "worse" (debt, leverage)
 */
export function trendDirection(
  prev: number | null | undefined,
  cur: number | null | undefined,
  larger_is_better = true,
): "up_good" | "up_bad" | "down_good" | "down_bad" | "flat" {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return "flat";
  if (prev === 0 && cur === 0) return "flat";
  const delta = cur - prev;
  if (Math.abs(delta) / Math.max(Math.abs(prev), 1) < 0.01) return "flat";
  if (delta > 0) return larger_is_better ? "up_good" : "up_bad";
  return larger_is_better ? "down_bad" : "down_good";
}

/** Polarity for ratio bands → tailwind classes. */
export const BAND_CLASSES: Record<
  "good" | "warning" | "concern" | "neutral",
  { bg: string; ring: string; text: string }
> = {
  good: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-800" },
  warning: { bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-800" },
  concern: { bg: "bg-rose-50", ring: "ring-rose-200", text: "text-rose-800" },
  neutral: { bg: "bg-slate-50", ring: "ring-slate-200", text: "text-slate-700" },
};
