import type { Config } from "tailwindcss";

/**
 * Self-contained Tailwind config for option-A (density-1 throughput dashboard).
 * Atrium tokens are inlined here rather than imported, so this option
 * builds standalone without the workspace theme package. Both kebab-case
 * and camelCase tints are declared so the vendored shared primitives
 * (which use `bg-semantic-successTint` etc.) and option-A's own classes
 * (`bg-semantic-success-tint`) both resolve.
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
        paper: { DEFAULT: "#FFFFFF", "2": "#F4F4F2", "3": "#ECECE8", pure: "#FFFFFF" },
        ink: { "1": "#0F0B0B", "2": "#2C2520", "3": "#665D55", "4": "#A39A91" },
        rule: "#E3E0DA",
        border: { DEFAULT: "#D8D4CE", strong: "#B5AFA6" },
        accent: { DEFAULT: "#86BC24", hover: "#73A11D", pressed: "#5F8718", fg: "#0F0B0B", tint: "#E8F3D0" },
        brandBlack: { DEFAULT: "#0F0B0B", fg: "#FFFFFF" },
        semantic: {
          success: "#3D8B3D",
          "success-tint": "#E6F4E6",
          successTint: "#E6F4E6",
          warning: "#B07A00",
          "warning-tint": "#FBF1D6",
          warningTint: "#FBF1D6",
          danger: "#C13838",
          "danger-tint": "#FBE4E4",
          dangerTint: "#FBE4E4",
          info: "#3367C9",
          "info-tint": "#E2EBF8",
          infoTint: "#E2EBF8",
        },
        // Surface aliases used by the vendored primitives.
        surface: {
          canvas: "#FFFFFF",
          panel: "#F4F4F2",
          border: "#E3E0DA",
        },
        text: {
          primary: "#0F0B0B",
          secondary: "#2C2520",
          muted: "#665D55",
        },
        brand: {
          primary: "#3367C9",
        },
        status: {
          ok: "#3D8B3D",
          okBg: "#E6F4E6",
          warning: "#B07A00",
          warningBg: "#FBF1D6",
          critical: "#C13838",
          criticalBg: "#FBE4E4",
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
        "h2": ["1.625rem", { lineHeight: "1.2", fontWeight: "600" }],
        "h3": ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
        "h4": ["1rem", { lineHeight: "1.4", fontWeight: "600" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.45" }],
        "ui": ["0.875rem", { lineHeight: "1.4" }],
        "mono-sm": ["0.75rem", { lineHeight: "1.3" }],
      },
      fontWeight: {
        semi: "600",
      },
    },
  },
  plugins: [],
};
export default config;
