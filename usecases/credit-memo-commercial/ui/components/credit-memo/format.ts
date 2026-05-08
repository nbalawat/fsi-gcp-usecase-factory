/**
 * Currency / percent / multiplier formatting helpers used across every memo
 * section. Centralised so the typography is consistent across all 10 sections.
 *
 * Numbers in a banker's memo follow strict conventions:
 *   - whole-dollar amounts in compact notation for headline ($25.0M),
 *     standard notation for tables ($24,780,000)
 *   - ratios with an "x" suffix at 2dp (1.41x)
 *   - percentages at 1dp with a trailing % (8.2%)
 *   - signed deltas explicitly carry a +/- (+0.3x, -120 bps)
 */

// Hand-rolled compact USD formatter so server-side Node ICU and browser ICU
// always produce identical strings (Intl.NumberFormat compact notation can
// disagree on trailing-zero retention and trigger React hydration errors).
export const fmtUsdCompact = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

// Full / standard USD formatter. We hand-roll thousands-separator insertion
// to keep identical output between Node and browser ICU.
export const fmtUsdFull = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  const s = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${s}`;
};

export const fmtUsdMillions = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${(n / 1_000_000).toFixed(1)}M`;
};

/** Schema percent fractions are 0..1 — render as 1dp percent. */
export const fmtPctFraction = (
  n: number | null | undefined,
  dp = 1,
): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(dp)}%`;
};

/** When a value is already a percent (e.g. covenant headroom 12.4 means 12.4%). */
export const fmtPctValue = (
  n: number | null | undefined,
  dp = 1,
): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(dp)}%`;
};

export const fmtRatioX = (
  n: number | null | undefined,
  dp = 2,
): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(dp)}x`;
};

export const fmtBps = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n)} bps`;
};

export const fmtSignedRatio = (
  n: number | null | undefined,
  dp = 2,
): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(dp)}x`;
};

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const titleCase = (s: string | null | undefined): string => {
  if (!s) return "";
  return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Severity tier helper — used by risk-factor bars + heat coloring. */
export type SeverityTier = "low" | "medium" | "high";

export const severityTier = (n: number): SeverityTier =>
  n <= 3 ? "low" : n <= 6 ? "medium" : "high";

export const severityClass: Record<SeverityTier, string> = {
  low: "bg-semantic-success",
  medium: "bg-semantic-warning",
  high: "bg-semantic-danger",
};

export const severityTextClass: Record<SeverityTier, string> = {
  low: "text-semantic-success",
  medium: "text-semantic-warning",
  high: "text-semantic-danger",
};

/** Risk-rating label (1-pass → "Pass", 2-special-mention → "Special Mention", …). */
export const riskBandLabel = (band: string | null | undefined): string => {
  if (!band) return "—";
  const map: Record<string, string> = {
    "1-pass": "Pass",
    "2-special-mention": "Special Mention",
    "3-substandard": "Substandard",
    "4-doubtful": "Doubtful",
    "5-loss": "Loss",
  };
  return map[band] ?? band;
};

export const decisionLabel = (d: string | null | undefined): string => {
  if (!d) return "—";
  const map: Record<string, string> = {
    approve: "Approve",
    approve_conditional: "Approve (Conditional)",
    decline: "Decline",
    return_for_revision: "Return for Revision",
  };
  return map[d] ?? d;
};
