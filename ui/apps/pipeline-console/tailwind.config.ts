import type { Config } from "tailwindcss";
import { colors, typography } from "@fsi-bank/theme";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/components/src/**/*.{ts,tsx}",
    "../../packages/components/stories/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        surface: colors.surface,
        text: colors.text,
        status: colors.status,
        riskBand: colors.riskBand,
        stageType: colors.stageType,
      },
      fontFamily: typography.fontFamily,
    },
  },
  plugins: [],
};

export default config;
