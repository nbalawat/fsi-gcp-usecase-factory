/**
 * Atrium Design System — bank brand tokens (Deloitte theme).
 *
 * Foundation for every console in the framework:
 *   pipeline-console · realtime-console · investigations-console
 *   surveillance-console · run-console · recommendations-console
 *
 * Anchor colors: Coral Black #0F0B0B + Deloitte Green #86BC24.
 * Type: Inter Tight (UI), Source Serif 4 (display), JetBrains Mono (code).
 *
 * Tokens are exposed two ways:
 *   1. As TypeScript constants → Tailwind picks them up via tailwind.config.ts
 *   2. As CSS custom properties → import `./tokens.css` in app globals.css
 *
 * Keys named per Atrium semantics:
 *   - paper / ink     → background / foreground tiers
 *   - rule / border   → hairline + 1px borders
 *   - accent          → Deloitte Green (single brand accent)
 *   - semantic        → success / warning / danger / info (muted, page-friendly)
 *   - dark            → coral-black ground for terminals + dark mode
 *
 * Legacy aliases (`brand`, `surface`, `text`, `status`) are retained so existing
 * components keep compiling while we migrate. Prefer the Atrium names for new code.
 */

export const palette = {
  paper: {
    DEFAULT: "#FFFFFF",
    "2": "#F4F4F2",
    "3": "#ECECE8",
    pure: "#FFFFFF",
  },
  ink: {
    "1": "#0F0B0B",
    "2": "#2C2A2A",
    "3": "#6B6868",
    "4": "#A09D9D",
  },
  rule: "#E5E3E0",
  border: "#D4D1CC",
  borderStrong: "#ABA7A1",

  accent: {
    DEFAULT: "#86BC24",
    hover: "#79A920",
    pressed: "#6B961C",
    fg: "#0F0B0B",
    tint: "#EEF6DC",
  },

  brandBlack: {
    DEFAULT: "#0F0B0B",
    fg: "#FFFFFF",
  },

  semantic: {
    success: "#4F8A1A",
    successTint: "#E4F0D2",
    warning: "#A86A1F",
    warningTint: "#F2E5CC",
    danger: "#A8341F",
    dangerTint: "#F0D9D2",
    info: "#3D5266",
    infoTint: "#DDE3EA",
  },

  dark: {
    ground: "#0F0B0B",
    "ground-2": "#1A1717",
    "ground-3": "#292625",
    sand: "#F4F2EE",
    "sand-2": "#B8B5B0",
    "sand-3": "#7C7975",
  },

  /** OCC risk-band heat map. Five steps from pass → loss. */
  riskBand: {
    "1-pass": "#4F8A1A",
    "2-special-mention": "#A86A1F",
    "3-substandard": "#C76A1F",
    "4-doubtful": "#A8341F",
    "5-loss": "#5C1E12",
  },

  /** Stage badges for workflow rails — keep all in the same value range. */
  stageType: {
    agent: "#3D5266",
    human: "#0F0B0B",
    mixed: "#6B961C",
    auto: "#6B6868",
  },
} as const;

export const colors = {
  // Atrium-native names (preferred)
  paper: palette.paper,
  ink: palette.ink,
  rule: palette.rule,
  border: palette.border,
  borderStrong: palette.borderStrong,
  accent: palette.accent,
  brandBlack: palette.brandBlack,
  semantic: palette.semantic,
  dark: palette.dark,
  riskBand: palette.riskBand,
  stageType: palette.stageType,

  // Legacy aliases — keep existing components compiling.
  brand: {
    primary: palette.brandBlack.DEFAULT,
    primaryDark: palette.brandBlack.DEFAULT,
    primaryLight: palette.ink["2"],
    accent: palette.accent.DEFAULT,
  },
  surface: {
    canvas: palette.paper.DEFAULT,
    panel: palette.paper.pure,
    panelMuted: palette.paper["2"],
    border: palette.border,
    borderStrong: palette.borderStrong,
  },
  text: {
    primary: palette.ink["1"],
    secondary: palette.ink["2"],
    muted: palette.ink["3"],
    inverse: palette.brandBlack.fg,
  },
  status: {
    ok: palette.semantic.success,
    okBg: palette.semantic.successTint,
    info: palette.semantic.info,
    infoBg: palette.semantic.infoTint,
    warning: palette.semantic.warning,
    warningBg: palette.semantic.warningTint,
    critical: palette.semantic.danger,
    criticalBg: palette.semantic.dangerTint,
    neutral: palette.ink["3"],
    neutralBg: palette.paper["3"],
  },
} as const;

export const typography = {
  fontFamily: {
    sans: [
      '"Inter Tight"',
      "system-ui",
      "-apple-system",
      "Segoe UI",
      "sans-serif",
    ],
    serif: [
      '"Source Serif 4"',
      "Georgia",
      '"Times New Roman"',
      "serif",
    ],
    mono: [
      '"JetBrains Mono"',
      "ui-monospace",
      '"SF Mono"',
      "Menlo",
      "Consolas",
      "monospace",
    ],
  },
  fontSize: {
    eyebrow: "0.6875rem",
    caption: "0.78125rem",
    ui: "0.875rem",
    "body-sm": "0.9375rem",
    body: "1rem",
    h4: "1rem",
    h3: "1.1875rem",
    h2: "1.5rem",
    h1: "2rem",
    "display-3": "2.5rem",
    "display-2": "3.5rem",
    "display-1": "4.5rem",
    mono: "0.90625rem",
    "mono-sm": "0.78125rem",
    // legacy aliases (Tailwind defaults)
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
  },
  fontWeight: {
    regular: "420",
    medium: "500",
    semi: "600",
    strong: "650",
  },
} as const;

export const spacing = {
  ramp: {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "20px",
    "6": "24px",
    "7": "32px",
    "8": "40px",
    "9": "56px",
    "10": "72px",
    "11": "96px",
  },
  cardPadding: "1rem",
  panelPadding: "1.5rem",
  stageColumnMin: "16rem",
} as const;

export const radii = {
  none: "0",
  "1": "4px",
  "2": "8px",
  "3": "12px",
  pill: "9999px",
} as const;

export const shadows = {
  sheet:
    "0 1px 2px rgba(15,17,21,0.04), 0 8px 24px -8px rgba(15,17,21,0.10)",
  pop: "0 1px 2px rgba(15,17,21,0.06), 0 4px 12px -4px rgba(15,17,21,0.08)",
  inset: "inset 0 1px 0 rgba(255,255,255,0.04)",
  inputFocus: "0 0 0 3px rgba(134,188,36,0.32)",
} as const;

export const layout = {
  width: {
    read: "720px",
    doc: "760px",
    grid: "1440px",
  },
  height: {
    header: "56px",
    toolbar: "40px",
    row: "36px",
  },
  nav: {
    width: "240px",
    widthCollapsed: "56px",
  },
} as const;

export const motion = {
  ease: "cubic-bezier(0.2, 0, 0, 1)",
  durationFast: "120ms",
  durationModerate: "180ms",
} as const;

export type RiskBand = keyof typeof palette.riskBand;
export type StageType = keyof typeof palette.stageType;
export type SemanticTone = keyof typeof palette.semantic;
