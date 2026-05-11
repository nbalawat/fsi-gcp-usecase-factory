import type { Config } from "tailwindcss";

/**
 * Self-contained Tailwind config for option-A (dense-queue density design).
 * Atrium tokens are inlined here rather than imported, so this option
 * builds standalone without the workspace theme package.
 *
 * The token surface mirrors `ui/packages/theme/src/tokens.css` so that
 * shared primitives (`@fsi-bank/components`) reference the same
 * semantic names — `bg-paper`, `text-ink-1`, `bg-surface-panel`,
 * `bg-semantic-success`, etc.
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
        // Aliases that the shared primitives reference.
        surface: {
          canvas: "#FFFFFF",
          panel: "#FFFFFF",
          panelMuted: "#F4F4F2",
          border: "#D8D4CE",
          borderStrong: "#B5AFA6",
        },
        text: {
          primary: "#0F0B0B",
          secondary: "#2C2520",
          muted: "#665D55",
          inverse: "#FFFFFF",
        },
        brand: {
          primary: "#86BC24",
          primaryDark: "#5F8718",
        },
        status: {
          ok: "#3D8B3D",
          okBg: "#E6F4E6",
          warning: "#B07A00",
          warningBg: "#FBF1D6",
          critical: "#C13838",
          criticalBg: "#FBE4E4",
          info: "#3367C9",
          infoBg: "#E2EBF8",
        },
        semantic: {
          success: "#3D8B3D", successTint: "#E6F4E6", "success-tint": "#E6F4E6",
          warning: "#B07A00", warningTint: "#FBF1D6", "warning-tint": "#FBF1D6",
          danger: "#C13838",  dangerTint: "#FBE4E4",  "danger-tint": "#FBE4E4",
          info: "#3367C9",    infoTint: "#E2EBF8",    "info-tint": "#E2EBF8",
        },
        riskBand: {
          "1-pass":             "#3D8B3D",
          "2-special-mention":  "#B07A00",
          "3-substandard":      "#D88B30",
          "4-doubtful":         "#C13838",
          "5-loss":             "#5C1F1F",
        },
      },
      fontFamily: {
        sans:  ["'Inter Tight'", "system-ui", "sans-serif"],
        serif: ["'Source Serif 4'", "Georgia", "serif"],
        mono:  ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        "mono-sm": ["12px", { lineHeight: "16px" }],
        "body-sm": ["13px", { lineHeight: "18px" }],
        ui:        ["13px", { lineHeight: "18px" }],
        h4:        ["15px", { lineHeight: "20px" }],
        h3:        ["18px", { lineHeight: "24px" }],
        h2:        ["22px", { lineHeight: "28px" }],
      },
      fontWeight: {
        semi: "600",
      },
    },
  },
  plugins: [],
};
export default config;
