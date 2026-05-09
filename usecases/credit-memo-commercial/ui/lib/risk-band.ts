/**
 * Risk-band display helpers.
 *
 * The platform stores risk_band as one of:
 *   - canonical enum:   "1-pass", "2-special-mention", "3-substandard",
 *                       "4-doubtful", "5-loss"
 *   - OCC code:         "OR-1" through "OR-5"
 *   - drafter variants: "Pass", "1 - Pass", "Special Mention", etc.
 *
 * The UI must render banker prose, not raw enums. This helper coerces any
 * known input to:
 *   { label: "Pass", code: "OR-1", tone: "success" }
 *
 * Usage:
 *   const r = riskBandLabel(c.risk_band);
 *   <Badge tone={r.tone}>{r.label} · {r.code}</Badge>
 */

export type RiskTone = "success" | "warning" | "danger" | "neutral";

export interface RiskBandDisplay {
  /** Banker prose: "Pass" / "Special Mention" / etc. */
  label: string;
  /** OCC code: "OR-1" through "OR-5" — small-font sidekick to the label. */
  code: string;
  /** Badge tone for the bank's color system. */
  tone: RiskTone;
  /** Numeric tier 1..5, useful for sort / heat-map keying. */
  tier: 1 | 2 | 3 | 4 | 5 | null;
}

const TABLE: Record<number, Omit<RiskBandDisplay, "tier">> = {
  1: { label: "Pass", code: "OR-1", tone: "success" },
  2: { label: "Special Mention", code: "OR-2", tone: "warning" },
  3: { label: "Substandard", code: "OR-3", tone: "warning" },
  4: { label: "Doubtful", code: "OR-4", tone: "danger" },
  5: { label: "Loss", code: "OR-5", tone: "danger" },
};

const NEUTRAL: RiskBandDisplay = {
  label: "Unrated",
  code: "—",
  tone: "neutral",
  tier: null,
};

/**
 * Coerce any known risk_band input to a display object.
 * Returns NEUTRAL for null / unknown / empty.
 */
export function riskBandLabel(raw: string | null | undefined): RiskBandDisplay {
  if (raw == null) return NEUTRAL;
  const s = String(raw).trim().toLowerCase();
  if (!s) return NEUTRAL;

  // Detect tier number from various formats
  let tier: 1 | 2 | 3 | 4 | 5 | null = null;

  // "1-pass", "2-special-mention", etc.
  const enumMatch = s.match(/^([1-5])[\s\-_]/);
  if (enumMatch) tier = Number(enumMatch[1]) as 1 | 2 | 3 | 4 | 5;

  // "or-1", "or-5"
  if (!tier) {
    const ocrMatch = s.match(/^or[\-_\s]?([1-5])/);
    if (ocrMatch) tier = Number(ocrMatch[1]) as 1 | 2 | 3 | 4 | 5;
  }

  // Bare "1" through "5"
  if (!tier && /^[1-5]$/.test(s)) tier = Number(s) as 1 | 2 | 3 | 4 | 5;

  // Word forms
  if (!tier) {
    if (s.includes("pass")) tier = 1;
    else if (s.includes("special") || s.includes("mention") || s === "sm") tier = 2;
    else if (s.includes("substandard") || s === "sub") tier = 3;
    else if (s.includes("doubtful")) tier = 4;
    else if (s.includes("loss")) tier = 5;
  }

  if (!tier) return NEUTRAL;
  return { ...TABLE[tier], tier };
}
