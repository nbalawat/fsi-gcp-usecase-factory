import type { Config } from "tailwindcss";

/**
 * Tailwind config — shadcn/ui standard, customized to the bank brand.
 *
 * All theme values flow from CSS variables defined in styles/globals.css
 * (the shadcn `--background`, `--foreground`, `--primary`, etc.). The
 * brand identity is encoded there:
 *   foreground = Coral Black #0F0B0B
 *   primary    = Deloitte Green #86BC24
 *
 * Three font families (sans / serif / mono) are loaded via @import in
 * globals.css and surfaced as Tailwind classes (font-sans / font-serif /
 * font-mono).
 *
 * Banking-domain semantic tones (`semantic-success` / -warning / -danger
 * / -info) and the OCC risk-band heat map (`risk-1` … `risk-5`) are
 * domain-specific and stay regardless of design-system framework.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/components/src/**/*.{ts,tsx}",
    "../../packages/components/stories/**/*.{ts,tsx}",
    "../../../usecases/credit-memo-commercial/ui/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // Banking domain — kept separately from shadcn's neutral set.
        semantic: {
          success: "hsl(var(--semantic-success))",
          successTint: "hsl(var(--semantic-success-tint))",
          warning: "hsl(var(--semantic-warning))",
          warningTint: "hsl(var(--semantic-warning-tint))",
          danger: "hsl(var(--semantic-danger))",
          dangerTint: "hsl(var(--semantic-danger-tint))",
          info: "hsl(var(--semantic-info))",
          infoTint: "hsl(var(--semantic-info-tint))",
        },
        risk: {
          1: "hsl(var(--risk-1))",
          2: "hsl(var(--risk-2))",
          3: "hsl(var(--risk-3))",
          4: "hsl(var(--risk-4))",
          5: "hsl(var(--risk-5))",
        },

        /* ───── Atrium compatibility shims ─────
         * Existing components have ~300 references to text-ink-*, bg-paper-*,
         * border-rule, etc. These shims keep them rendering during the
         * incremental migration. New code MUST use shadcn vocabulary
         * (text-foreground, bg-background, bg-muted, border-border).
         * The shims will be removed in Phase 5 of the migration plan.
         */
        ink: {
          1: "hsl(var(--foreground))",
          2: "hsl(0 5% 17%)",
          3: "hsl(var(--muted-foreground))",
          4: "hsl(0 1% 63%)",
        },
        paper: {
          DEFAULT: "hsl(var(--background))",
          2: "hsl(var(--muted))",
          3: "hsl(40 11% 92%)",
          pure: "hsl(var(--background))",
        },
        rule: "hsl(var(--border))",
        "border-strong": "hsl(0 5% 67%)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "display-1": ["72px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-2": ["56px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-3": ["40px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "h1": ["32px", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        "h2": ["24px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        "h3": ["19px", { lineHeight: "1.3" }],
        "h4": ["16px", { lineHeight: "1.35", fontWeight: "600" }],
        "body": ["16px", { lineHeight: "1.55" }],
        "body-sm": ["15px", { lineHeight: "1.5" }],
        "ui": ["14px", { lineHeight: "1.4" }],
        "caption": ["12.5px", { lineHeight: "1.4" }],
        "eyebrow": ["11px", { lineHeight: "1.2", letterSpacing: "0.06em", textTransform: "uppercase" }],
        "mono": ["14.5px", { lineHeight: "1.5" }],
        "mono-sm": ["12.5px", { lineHeight: "1.5" }],
      },
      fontWeight: {
        regular: "420",
        medium: "500",
        semi: "600",
        strong: "650",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sheet: "0 1px 2px rgba(15,17,21,0.04), 0 8px 24px -8px rgba(15,17,21,0.10)",
        pop: "0 1px 2px rgba(15,17,21,0.06), 0 4px 12px -4px rgba(15,17,21,0.08)",
        "input-focus": "0 0 0 3px hsl(var(--ring) / 0.32)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 200ms ease-out",
        "accordion-up": "accordion-up 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
