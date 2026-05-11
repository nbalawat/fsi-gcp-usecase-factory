import type { Config } from "tailwindcss";

/**
 * Self-contained Tailwind config for option-B (geographic-map design).
 * Atrium tokens are inlined here rather than imported so this option
 * builds standalone without the workspace theme package. Both the
 * Atrium-native names AND legacy aliases (surface/text/status/brand)
 * are declared so vendored shared primitives render correctly.
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
        // ─── Atrium-native names (preferred) ───────────────────────
        paper: { DEFAULT: "#FFFFFF", "2": "#F4F4F2", "3": "#ECECE8", pure: "#FFFFFF" },
        ink: { "1": "#0F0B0B", "2": "#2C2520", "3": "#665D55", "4": "#A39A91" },
        rule: "#E3E0DA",
        border: { DEFAULT: "#D8D4CE", strong: "#B5AFA6" },
        accent: { DEFAULT: "#86BC24", hover: "#73A11D", pressed: "#5F8718", fg: "#0F0B0B", tint: "#E8F3D0" },
        brandBlack: { DEFAULT: "#0F0B0B", fg: "#FFFFFF" },
        semantic: {
          success: "#3D8B3D", "success-tint": "#E6F4E6", successTint: "#E6F4E6",
          warning: "#B07A00", "warning-tint": "#FBF1D6", warningTint: "#FBF1D6",
          danger: "#C13838",  "danger-tint": "#FBE4E4",  dangerTint:  "#FBE4E4",
          info: "#3367C9",    "info-tint": "#E2EBF8",    infoTint:    "#E2EBF8",
        },
        riskBand: {
          "1-pass":             "#3D8B3D",
          "2-special-mention":  "#B07A00",
          "3-substandard":      "#D88B30",
          "4-doubtful":         "#C13838",
          "5-loss":             "#5C1F1F",
        },
        // ─── Legacy aliases used by shared primitives ──────────────
        brand: {
          primary: "#0F0B0B",
          primaryDark: "#0F0B0B",
          primaryLight: "#2C2520",
          accent: "#86BC24",
        },
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
        status: {
          ok: "#3D8B3D",
          okBg: "#E6F4E6",
          info: "#3367C9",
          infoBg: "#E2EBF8",
          warning: "#B07A00",
          warningBg: "#FBF1D6",
          critical: "#C13838",
          criticalBg: "#FBE4E4",
          neutral: "#665D55",
          neutralBg: "#ECECE8",
        },
      },
      fontFamily: {
        sans:  ["'Inter Tight'", "system-ui", "sans-serif"],
        serif: ["'Source Serif 4'", "Georgia", "serif"],
        mono:  ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        eyebrow: "0.6875rem",
        ui: "0.875rem",
        "body-sm": "0.9375rem",
        h4: "1rem",
        h3: "1.1875rem",
        h2: "1.5rem",
        h1: "2rem",
        "mono-sm": "0.78125rem",
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
