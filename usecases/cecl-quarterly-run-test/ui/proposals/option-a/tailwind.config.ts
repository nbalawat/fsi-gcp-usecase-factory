import type { Config } from "tailwindcss";

/**
 * Self-contained Tailwind config for option-A (sparse executive dashboard).
 *
 * Atrium tokens (Section 1.1 of docs/methodology/ui-standards.md) are
 * inlined here rather than imported, so this option builds standalone
 * without the workspace theme package. The legacy aliases
 * (surface-*, text-*, status-*, brand-*, stageType-*) are also extended
 * so the shared primitives (which still reference some legacy class
 * names) render correctly in this sealed proposal.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./_vendor/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Atrium paper / ink anchors
        paper: { DEFAULT: "#FFFFFF", "2": "#F4F4F2", "3": "#ECECE8", pure: "#FFFFFF" },
        ink: { "1": "#0F0B0B", "2": "#2C2520", "3": "#665D55", "4": "#A39A91" },
        rule: "#E3E0DA",
        border: { DEFAULT: "#D8D4CE", strong: "#B5AFA6" },
        accent: { DEFAULT: "#86BC24", hover: "#73A11D", pressed: "#5F8718", fg: "#0F0B0B", tint: "#E8F3D0" },
        brandBlack: { DEFAULT: "#0F0B0B", fg: "#FFFFFF" },
        semantic: {
          success: "#3D8B3D", "success-tint": "#E6F4E6", successTint: "#E6F4E6",
          warning: "#B07A00", "warning-tint": "#FBF1D6", warningTint: "#FBF1D6",
          danger: "#C13838",  "danger-tint": "#FBE4E4",  dangerTint: "#FBE4E4",
          info: "#3367C9",    "info-tint": "#E2EBF8",    infoTint: "#E2EBF8",
        },
        riskBand: {
          "1-pass":             "#3D8B3D",
          "2-special-mention":  "#B07A00",
          "3-substandard":      "#D88B30",
          "4-doubtful":         "#C13838",
          "5-loss":             "#5C1F1F",
        },
        // Legacy aliases — kept so the shared primitives (which still
        // reference these names in some files) resolve.
        surface: {
          canvas: "#FFFFFF",
          panel: "#F4F4F2",
          panelMuted: "#ECECE8",
          border: "#E3E0DA",
          borderStrong: "#B5AFA6",
        },
        text: {
          primary: "#0F0B0B",
          secondary: "#665D55",
          muted: "#A39A91",
          inverse: "#FFFFFF",
        },
        status: {
          ok: "#3D8B3D",
          okBg: "#E6F4E6",
          warning: "#B07A00",
          warningBg: "#FBF1D6",
          critical: "#C13838",
          criticalBg: "#FBE4E4",
        },
        brand: {
          primary: "#86BC24",
          primaryDark: "#5F8718",
        },
        stageType: {
          agent: "#3367C9",
          human: "#86BC24",
          mixed: "#B07A00",
          auto: "#665D55",
        },
      },
      fontFamily: {
        sans:  ["'Inter Tight'", "system-ui", "sans-serif"],
        serif: ["'Source Serif 4'", "Georgia", "serif"],
        mono:  ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        "mono-sm": ["12.5px", { lineHeight: "1.4" }],
        "mono": ["14.5px", { lineHeight: "1.4" }],
        "body-sm": ["15px", { lineHeight: "1.5" }],
        "body": ["16px", { lineHeight: "1.5" }],
        "ui": ["14px", { lineHeight: "1.4" }],
        "h4": ["16px", { lineHeight: "1.3" }],
        "h3": ["19px", { lineHeight: "1.3" }],
        "h2": ["24px", { lineHeight: "1.25" }],
        "h1": ["32px", { lineHeight: "1.2" }],
      },
      fontWeight: {
        regular: "420",
        medium: "500",
        semi: "600",
        strong: "650",
      },
    },
  },
  plugins: [],
};
export default config;
