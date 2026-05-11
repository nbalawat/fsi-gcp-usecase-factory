// Option B — map-metaphor surveillance proposal.
//
// Data layer is read-only: every export below traces back to the
// single source of truth at `_shared/mock-data.ts`. Adapters BELOW
// the re-export bar are pure shape transforms — no business logic,
// no thresholds, no math beyond simple counting/aggregation.

import {
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
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
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
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

// ─── Census region tiling ──────────────────────────────────────────
// The US Census Bureau divides the 50 states into 4 regions / 9 divisions.
// We use the 4-region layout for the page header (it's the most legible
// at the dashboard density) plus a city-cluster overlay for detail.
// Pure lookup — NOT business rules. Display-only.

export type CensusRegion = "Northeast" | "Midwest" | "South" | "West";

const STATE_TO_REGION: Record<string, CensusRegion> = {
  // Northeast
  ME: "Northeast", NH: "Northeast", VT: "Northeast", MA: "Northeast",
  RI: "Northeast", CT: "Northeast", NY: "Northeast", NJ: "Northeast", PA: "Northeast",
  // Midwest
  OH: "Midwest", IN: "Midwest", IL: "Midwest", MI: "Midwest", WI: "Midwest",
  MN: "Midwest", IA: "Midwest", MO: "Midwest", ND: "Midwest", SD: "Midwest",
  NE: "Midwest", KS: "Midwest",
  // South
  DE: "South", MD: "South", DC: "South", VA: "South", WV: "South",
  NC: "South", SC: "South", GA: "South", FL: "South", KY: "South",
  TN: "South", AL: "South", MS: "South", AR: "South", LA: "South",
  OK: "South", TX: "South",
  // West
  MT: "West", ID: "West", WY: "West", CO: "West", NM: "West",
  AZ: "West", UT: "West", NV: "West", CA: "West", OR: "West",
  WA: "West", AK: "West", HI: "West",
};

export const regionFor = (state: string): CensusRegion =>
  STATE_TO_REGION[state] ?? "Midwest";

// ─── Facility shape ────────────────────────────────────────────────
// In the map metaphor, every borrower in BORROWERS is rendered as a
// CRE facility at its `geo` (the state) location. We synthesize NO
// new identities — every facility is a 1:1 projection of a Borrower.

export interface Facility {
  /** facility id, derived from borrower id */
  id: string;
  borrower: Borrower;
  state: string;
  region: CensusRegion;
  /** Banker-readable property label */
  property: string;
  /** Risk band — passed through verbatim from the canvas */
  riskBand: string;
  /** Exposure (USD) — directly from borrower revenue (shape parity only). */
  exposureUsd: number;
  /** "watch" if the risk_band > 1-pass (display heuristic, not a rule). */
  watchlist: boolean;
}

const propertyTypeFor = (naics: string): string => {
  // Display-only label per NAICS supersector. NOT a business rule.
  if (naics === "33") return "Industrial · Class B";
  if (naics === "31") return "Mixed-use · Class A";
  if (naics === "32") return "Office · Class A";
  return "Commercial · Class B";
};

export const FACILITIES: Facility[] = BORROWERS.map((b) => ({
  id: `FAC-${b.id.replace("BRW-", "")}`,
  borrower: b,
  state: b.geo,
  region: regionFor(b.geo),
  property: propertyTypeFor(b.naics),
  riskBand: b.risk_band,
  exposureUsd: b.revenue_usd,
  watchlist: b.risk_band !== "1-pass",
}));

// ─── Region aggregates — for the MAP tiles ─────────────────────────

export interface RegionAggregate {
  region: CensusRegion;
  facilityCount: number;
  watchCount: number;
  totalExposureUsd: number;
  /** display heatmap level 0..4 derived from watch share */
  heatLevel: 0 | 1 | 2 | 3 | 4;
}

const heatLevelFor = (watch: number, total: number): 0 | 1 | 2 | 3 | 4 => {
  if (total === 0) return 0;
  const share = watch / total;
  if (share === 0) return 0;
  if (share < 0.15) return 1;
  if (share < 0.30) return 2;
  if (share < 0.50) return 3;
  return 4;
};

const REGIONS: CensusRegion[] = ["Northeast", "Midwest", "South", "West"];

export const REGION_AGGREGATES: RegionAggregate[] = REGIONS.map((r) => {
  const inRegion = FACILITIES.filter((f) => f.region === r);
  const watch = inRegion.filter((f) => f.watchlist).length;
  return {
    region: r,
    facilityCount: inRegion.length,
    watchCount: watch,
    totalExposureUsd: inRegion.reduce((sum, f) => sum + f.exposureUsd, 0),
    heatLevel: heatLevelFor(watch, inRegion.length),
  };
});

// ─── City clusters — second-level drill view on the map ───────────
// Group facilities by state (a state IS a city cluster for this
// proposal's purposes — keeps the geometry to one dimension).

export interface StateCluster {
  state: string;
  region: CensusRegion;
  facilities: Facility[];
  watchCount: number;
  totalExposureUsd: number;
  heatLevel: 0 | 1 | 2 | 3 | 4;
}

export const STATE_CLUSTERS: StateCluster[] = (() => {
  const byState = new Map<string, Facility[]>();
  for (const f of FACILITIES) {
    const list = byState.get(f.state) ?? [];
    list.push(f);
    byState.set(f.state, list);
  }
  return Array.from(byState.entries()).map(([state, facs]) => {
    const watch = facs.filter((f) => f.watchlist).length;
    return {
      state,
      region: regionFor(state),
      facilities: facs,
      watchCount: watch,
      totalExposureUsd: facs.reduce((sum, f) => sum + f.exposureUsd, 0),
      heatLevel: heatLevelFor(watch, facs.length),
    };
  });
})();

// ─── Facility lookup by id (case-detail surface) ──────────────────

export const getFacility = (id: string): Facility => {
  const norm = id.toUpperCase();
  const found = FACILITIES.find(
    (f) => f.id === norm || f.id.replace("FAC-", "") === norm.replace("FAC-", ""),
  );
  // Defensive fallback — if the id is unknown, return the primary
  // facility so the surface still renders (Rule 14: defensive UI).
  return found ?? FACILITIES[0];
};

// ─── Gate state — derived strictly from PIPELINE_EVENTS ──────────

export type GateStatus = "pending" | "decided" | "not-reached";

export interface GateState {
  name: string;
  irrevocable: boolean;
  description: string;
  status: GateStatus;
  decision?: string;
  decidedAt?: string;
  raisedAt?: string;
}

interface EventRef {
  kind: string;
  at?: string;
  decision?: string;
  gate?: unknown;
}

const gateName = (g: unknown): string => {
  if (g === null || g === undefined) return "";
  if (typeof g === "string") return g;
  if (typeof g === "object" && g !== null && "name" in g) {
    const v = (g as { name?: unknown }).name;
    return typeof v === "string" ? v : "";
  }
  return "";
};

export const gateStates = (
  events: readonly EventRef[],
  gates: readonly { name: string; irrevocable: boolean; description: string }[],
): GateState[] =>
  gates.map((g) => {
    const decided = events.find(
      (e) => e.kind === "human_action" && gateName(e.gate) === g.name,
    );
    const pending = events.find(
      (e) =>
        e.kind === "human_action_pending" && gateName(e.gate) === g.name,
    );
    if (decided) {
      return {
        ...g,
        status: "decided" as const,
        decision: decided.decision,
        decidedAt: decided.at,
      };
    }
    if (pending) {
      return {
        ...g,
        status: "pending" as const,
        raisedAt: pending.at,
      };
    }
    return { ...g, status: "not-reached" as const };
  });

// ─── Display helpers — pure formatting, no math ──────────────────

export const fmtUsd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

export const fmtPct = (n: number): string => `${(n * 100).toFixed(0)}%`;
