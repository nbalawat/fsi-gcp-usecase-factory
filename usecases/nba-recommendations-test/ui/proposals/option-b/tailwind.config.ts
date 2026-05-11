import type { Config } from "tailwindcss";

/**
 * Self-contained Tailwind config for option-B (narrative-relationship design).
 * Atrium tokens are inlined here rather than imported, so this option builds
 * standalone without the workspace theme package. NO _vendor symlinks (per
 * Rule 38 / self-contained constraint).
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
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
          success: "#3D8B3D", "successTint": "#E6F4E6", "success-tint": "#E6F4E6",
          warning: "#B07A00", "warningTint": "#FBF1D6", "warning-tint": "#FBF1D6",
          danger: "#C13838",  "dangerTint": "#FBE4E4",  "danger-tint": "#FBE4E4",
          info: "#3367C9",    "infoTint": "#E2EBF8",    "info-tint": "#E2EBF8",
        },
        urgency: {
          urgent: "#A32D2D",
          "urgent-tint": "#FBE4E4",
          attention: "#BA7517",
          "attention-tint": "#FBF1D6",
          routine: "#888780",
          "routine-tint": "#ECECE8",
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
        "mono-sm": ["12px", "16px"],
        "ui":      ["14px", "20px"],
        "h3":      ["18px", "24px"],
        "h2":      ["22px", "28px"],
        "h1":      ["28px", "36px"],
        "caption": ["12px", "16px"],
      },
      fontWeight: {
        semi: "600",
      },
    },
  },
  plugins: [],
};
export default config;
