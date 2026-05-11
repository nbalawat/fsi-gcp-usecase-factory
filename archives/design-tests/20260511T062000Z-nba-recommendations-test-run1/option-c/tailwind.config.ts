import type { Config } from "tailwindcss";

/**
 * Self-contained Tailwind config for option-C (inline-disposition recommendations
 * console). Atrium tokens are inlined here rather than imported from the
 * workspace theme package, so this option builds standalone — no _vendor
 * symlinks. All UI uses Tailwind tokens; arbitrary values are not used.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./primitives/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Atrium-native — paper / ink / rule / accent / semantic / riskBand.
        paper: { DEFAULT: "#FFFFFF", "2": "#F4F4F2", "3": "#ECECE8", pure: "#FFFFFF" },
        ink: { "1": "#0F0B0B", "2": "#2C2A2A", "3": "#6B6868", "4": "#A09D9D" },
        rule: "#E5E3E0",
        border: { DEFAULT: "#D4D1CC", strong: "#ABA7A1" },
        accent: {
          DEFAULT: "#86BC24",
          hover: "#79A920",
          pressed: "#6B961C",
          fg: "#0F0B0B",
          tint: "#EEF6DC",
        },
        brandBlack: { DEFAULT: "#0F0B0B", fg: "#FFFFFF" },
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
        riskBand: {
          "1-pass": "#4F8A1A",
          "2-special-mention": "#A86A1F",
          "3-substandard": "#C76A1F",
          "4-doubtful": "#A8341F",
          "5-loss": "#5C1E12",
        },
        // Legacy aliases — keep inline primitives compiling. These mirror
        // the same Atrium tokens so the optical surface is consistent.
        brand: {
          primary: "#0F0B0B",
          primaryDark: "#0F0B0B",
          primaryLight: "#2C2A2A",
          accent: "#86BC24",
        },
        surface: {
          canvas: "#FFFFFF",
          panel: "#FFFFFF",
          panelMuted: "#F4F4F2",
          border: "#D4D1CC",
          borderStrong: "#ABA7A1",
        },
        text: {
          primary: "#0F0B0B",
          secondary: "#2C2A2A",
          muted: "#6B6868",
          inverse: "#FFFFFF",
        },
        status: {
          ok: "#4F8A1A",
          okBg: "#E4F0D2",
          info: "#3D5266",
          infoBg: "#DDE3EA",
          warning: "#A86A1F",
          warningBg: "#F2E5CC",
          critical: "#A8341F",
          criticalBg: "#F0D9D2",
          neutral: "#6B6868",
          neutralBg: "#ECECE8",
        },
      },
      fontFamily: {
        sans: ["'Inter Tight'", "system-ui", "-apple-system", "sans-serif"],
        serif: ["'Source Serif 4'", "Georgia", "serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
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
        mono: "0.90625rem",
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
