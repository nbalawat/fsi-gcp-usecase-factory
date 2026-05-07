/**
 * Bank brand tokens.
 *
 * These tokens are consumed by Tailwind via tailwind.config.ts in each app.
 * Do not import these into components directly — use the Tailwind classes
 * generated from them (e.g. `bg-brand-primary`, `text-status-warning`).
 */

export const colors = {
  brand: {
    primary: "#0B3D91",      // bank navy
    primaryDark: "#072a66",
    primaryLight: "#1f5cc4",
    accent: "#F2A900",       // bank gold
  },
  surface: {
    canvas: "#F7F8FA",       // page background
    panel: "#FFFFFF",        // card / panel background
    panelMuted: "#F1F3F6",
    border: "#E2E5EA",
    borderStrong: "#C7CCD4",
  },
  text: {
    primary: "#0F172A",
    secondary: "#475569",
    muted: "#64748B",
    inverse: "#FFFFFF",
  },
  status: {
    ok: "#16A34A",           // green — within SLA, accepted
    okBg: "#DCFCE7",
    info: "#0284C7",
    infoBg: "#DBEAFE",
    warning: "#D97706",      // amber — at-risk
    warningBg: "#FEF3C7",
    critical: "#DC2626",     // red — breach, declined
    criticalBg: "#FEE2E2",
    neutral: "#64748B",
    neutralBg: "#F1F5F9",
  },
  riskBand: {
    "1-pass": "#16A34A",
    "2-special-mention": "#CA8A04",
    "3-substandard": "#EA580C",
    "4-doubtful": "#DC2626",
    "5-loss": "#7F1D1D",
  },
  stageType: {
    agent: "#6366F1",        // indigo — agent stages
    human: "#0B3D91",        // navy — human checkpoints
    mixed: "#7C3AED",        // purple — mixed stages
    auto: "#64748B",         // slate — auto stages
  },
} as const;

export const typography = {
  fontFamily: {
    sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
    mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
  },
} as const;

export const spacing = {
  cardPadding: "1rem",
  panelPadding: "1.5rem",
  stageColumnMin: "16rem",
} as const;

export type RiskBand = keyof typeof colors.riskBand;
export type StageType = keyof typeof colors.stageType;
