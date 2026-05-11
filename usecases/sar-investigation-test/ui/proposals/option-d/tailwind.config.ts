import type { Config } from "tailwindcss";

/**
 * Self-contained Tailwind config for option-D
 * (counterparty-graph-first SAR investigation).
 * Atrium tokens are inlined here rather than imported, so this option
 * builds standalone without the workspace theme package.
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
          success: "#3D8B3D", "success-tint": "#E6F4E6",
          warning: "#B07A00", "warning-tint": "#FBF1D6",
          danger: "#C13838",  "danger-tint": "#FBE4E4",
          info: "#3367C9",    "info-tint": "#E2EBF8",
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
    },
  },
  plugins: [],
};
export default config;
