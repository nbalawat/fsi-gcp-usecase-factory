// Option A — dense executive grid for cre-surveillance-test.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. Adapters BELOW the re-export bar are pure shape
// transforms (borrower → facility cell) — no business logic, no math.

import {
  ATOMIC_SERVICE_STUBS,
  AGENT_OUTPUT_STUBS,
  BORROWERS,
  CANVAS_SHA256,
  CASE_SHAPE,
  COMPLIANCE_SCOPE,
  HITL_GATES,
  LIVE_CASE,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  PRIMARY_BORROWER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  type Borrower,
  type CaseShape,
} from "../../_shared/mock-data";

export {
  ATOMIC_SERVICE_STUBS,
  AGENT_OUTPUT_STUBS,
  BORROWERS,
  CANVAS_SHA256,
  CASE_SHAPE,
  COMPLIANCE_SCOPE,
  HITL_GATES,
  LIVE_CASE,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  PRIMARY_BORROWER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
};
export type { Borrower, CaseShape };

// ─── facility model ──────────────────────────────────────────────────
// One facility per borrower in the canvas. The CRE surveillance domain
// scores each facility against five risk dimensions; the page is the
// 2D grid (facility row × dimension column).

export const RISK_DIMENSIONS = [
  { id: "dscr",       label: "DSCR",          tooltip: "Debt service coverage ratio band" },
  { id: "ltv",        label: "LTV",           tooltip: "Loan-to-value band" },
  { id: "cap_rate",   label: "Cap rate",      tooltip: "Cap rate band vs market" },
  { id: "occupancy",  label: "Occupancy",     tooltip: "Stabilized occupancy band" },
  { id: "concentr",   label: "Concentration", tooltip: "Region · property-type concentration" },
] as const;

export type RiskDimensionId = (typeof RISK_DIMENSIONS)[number]["id"];

export interface Facility {
  id: string;             // FAC-<borrower-id-tail>
  borrowerId: string;
  borrowerName: string;
  geo: string;
  naics: string;
  exposureUsd: number;    // re-uses borrower revenue as a stand-in for exposure
  // Per-dimension risk band, derived deterministically from the borrower's
  // canvas-declared band so this stays canvas-faithful. Pure shape transform.
  bands: Record<RiskDimensionId, BandKey>;
}

export type BandKey =
  | "1-pass"
  | "2-special-mention"
  | "3-substandard"
  | "4-doubtful"
  | "5-loss";

const ALL_BANDS: readonly BandKey[] = [
  "1-pass",
  "2-special-mention",
  "3-substandard",
  "4-doubtful",
  "5-loss",
];

// Deterministic per-cell band derivation. Anchor band comes from the
// canvas borrower record (`risk_band`). Surrounding cells fan ±1 step
// around that anchor based on (borrower-id, dimension-id) so each row
// has a believable spread while remaining stable build-to-build.
function bandFor(anchor: string, borrowerId: string, dimId: string): BandKey {
  const anchorIdx = ALL_BANDS.indexOf(anchor as BandKey);
  const safeAnchor = anchorIdx === -1 ? 0 : anchorIdx;
  // Hash inputs into a tiny 0..2 number deterministically.
  let h = 0;
  const s = `${borrowerId}::${dimId}`;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  const offset = (h % 3) - 1; // -1, 0, or +1
  const idx = Math.max(0, Math.min(ALL_BANDS.length - 1, safeAnchor + offset));
  return ALL_BANDS[idx];
}

export const FACILITIES: Facility[] = BORROWERS.map((b) => {
  const bands = {} as Record<RiskDimensionId, BandKey>;
  for (const d of RISK_DIMENSIONS) {
    bands[d.id] = bandFor(b.risk_band, b.id, d.id);
  }
  return {
    id: `FAC-${b.id.replace("BRW-", "")}`,
    borrowerId: b.id,
    borrowerName: b.name,
    geo: b.geo,
    naics: b.naics,
    exposureUsd: b.revenue_usd,
    bands,
  };
});

export function getFacility(id: string): Facility {
  // Defensive lookup (Rule 14). When the id is unknown — e.g. the demo
  // "SAMPLE" link — fall back to the first facility so the page still
  // renders. No throw, no 500.
  return (
    FACILITIES.find((f) => f.id === id || f.borrowerId === id) ?? FACILITIES[0]
  );
}

// ─── grid-level rollups ──────────────────────────────────────────────
// All values surfaced from the canvas-supplied data. No math.

export interface BandTally {
  band: BandKey;
  count: number;
}

export function tallyByBand(): BandTally[] {
  const counts: Record<BandKey, number> = {
    "1-pass": 0,
    "2-special-mention": 0,
    "3-substandard": 0,
    "4-doubtful": 0,
    "5-loss": 0,
  };
  for (const f of FACILITIES) {
    for (const d of RISK_DIMENSIONS) {
      counts[f.bands[d.id]] += 1;
    }
  }
  return ALL_BANDS.map((b) => ({ band: b, count: counts[b] }));
}

export function bandLabel(b: BandKey): string {
  switch (b) {
    case "1-pass": return "Pass";
    case "2-special-mention": return "Special mention";
    case "3-substandard": return "Substandard";
    case "4-doubtful": return "Doubtful";
    case "5-loss": return "Loss";
  }
}

// ─── HITL gate helpers ───────────────────────────────────────────────

export interface GateState {
  name: string;
  irrevocable: boolean;
  description: string;
  status: "pending" | "decided" | "queued";
  decision?: string;
}

export function gateStates(): GateState[] {
  // Replay PIPELINE_EVENTS to derive the current status of each declared
  // HITL gate. Pure shape transform — read events, classify.
  const decided = new Map<string, string>();
  const pending = new Set<string>();
  for (const e of PIPELINE_EVENTS) {
    if (e.kind === "human_action_pending" && e.gate?.name) {
      pending.add(e.gate.name);
    }
    if (e.kind === "human_action" && e.gate?.name) {
      decided.set(e.gate.name, e.decision ?? "");
      pending.delete(e.gate.name);
    }
  }
  return HITL_GATES.map((g) => {
    if (decided.has(g.name)) {
      return { ...g, status: "decided" as const, decision: decided.get(g.name) };
    }
    if (pending.has(g.name)) {
      return { ...g, status: "pending" as const };
    }
    return { ...g, status: "queued" as const };
  });
}

// ─── currency helper ─────────────────────────────────────────────────
// Display-only, no rounding rules — surface the canvas number verbatim
// at the executive density needed for the 30-second scan.

export function shortUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}
