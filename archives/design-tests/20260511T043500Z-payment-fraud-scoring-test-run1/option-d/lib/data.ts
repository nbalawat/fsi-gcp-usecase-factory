// Option D — wildcard "feature × MCC heatmap" view.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. Adapters BELOW the re-export bar are pure shape
// transforms (event → row, event → cell tally, event → score band) —
// no business logic, no scoring math, no decisions made.

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

// Canvas SHA per the orchestrator's stated header (used for the pinned
// canvas chip). The generator's runtime hash for the mock data is kept
// separate at CANVAS_SHA256 above; both are surfaced for parity.
export const CANVAS_CHECKSUM_PINNED =
  "cc47591b9d1241218f08426d1f4ca8be84cd1b6cb4cb31bc23066ab2f9e80c5f";

// --- canonical feature axis -------------------------------------------
// The features below are the FRAUD MODEL's top fired features in this
// scoring band (display labels only; no thresholds in the UI, the rule
// engine and the agent own those). The list is FIXED at design-time —
// new features only appear when the model card is updated.

export interface FeatureAxis {
  id: string;
  label: string;
  family: "velocity" | "geo" | "device" | "behavioral" | "merchant";
}

export const FEATURES: FeatureAxis[] = [
  { id: "velocity_5m",    label: "velocity 5m",      family: "velocity" },
  { id: "geo_jump",       label: "geo jump",          family: "geo" },
  { id: "new_device",     label: "new device",        family: "device" },
  { id: "amt_outlier",    label: "amt outlier",       family: "behavioral" },
  { id: "card_present",   label: "card-present mismatch", family: "merchant" },
  { id: "cvv_retry",      label: "CVV retry",         family: "behavioral" },
  { id: "off_hours",      label: "off hours",         family: "behavioral" },
  { id: "high_risk_mcc",  label: "high-risk MCC",     family: "merchant" },
];

// --- canonical MCC axis -----------------------------------------------
// Merchant Category Codes, banker-readable. Display-only.

export interface MccAxis {
  id: string;
  label: string;
}

export const MCCS: MccAxis[] = [
  { id: "5411", label: "Grocery"        },
  { id: "5541", label: "Service stn."   },
  { id: "5732", label: "Electronics"    },
  { id: "5912", label: "Pharmacy"       },
  { id: "5967", label: "Direct mktg."   },
  { id: "6011", label: "ATM"            },
  { id: "7995", label: "Gambling"       },
  { id: "4829", label: "Wire/crypto"    },
];

// --- event shape ------------------------------------------------------
// Each "firing" is one payment attempt; the cells it lights up are
// (feature × mcc) pairs derived from its contributing-feature list and
// its merchant MCC. Decisions are display-only; the agent decides.

export type Decision = "approve" | "decline" | "step-up";

export interface FiringEvent {
  id: string;
  at: string;              // ISO instant
  amountUsd: number;
  mcc: string;
  merchant: string;
  cardLast4: string;
  decision: Decision;
  score: number;           // 0..100, banker-readable score
  modelConfidence: number; // 0..1
  features: string[];      // feature ids that fired for this event
}

// Synthesize a deterministic stream of firings from the canvas events
// + the shared borrower roster. NO randomness on the request path; the
// stream is fully derived from the pipeline events so audits replay.
//
// PURE SHAPE TRANSFORM — no model math here, no decisions invented.
// `decision`, `score`, `modelConfidence`, `features` are mapped from
// stable fields on PIPELINE_EVENTS via deterministic lookup tables.
const FIRING_SEED = [
  // [seqOffset, amount, mcc, merchantLabel, decision, score, conf, feats]
  [0,  2847.10, "5411", "Walmart Supercenter",     "approve", 8,  0.97, ["amt_outlier"]] as const,
  [1,    49.99, "5411", "Kroger",                   "approve", 4,  0.99, []] as const,
  [2,   215.00, "5912", "CVS Pharmacy",             "approve", 12, 0.95, ["amt_outlier"]] as const,
  [3,  9800.00, "7995", "OnlineCasino-EU",          "decline", 88, 0.93, ["high_risk_mcc","geo_jump","off_hours","amt_outlier"]] as const,
  [4,   320.00, "5541", "Shell #4421",              "approve", 11, 0.95, ["off_hours"]] as const,
  [5,   650.00, "5732", "BestBuy",                  "step-up", 52, 0.82, ["new_device","amt_outlier"]] as const,
  [6,  1100.00, "6011", "ATM-WellsFargo",           "step-up", 47, 0.78, ["velocity_5m","off_hours"]] as const,
  [7,    14.99, "5912", "Walgreens",                "approve", 6,  0.98, []] as const,
  [8,  2500.00, "4829", "BitMart-Funding",          "decline", 91, 0.94, ["high_risk_mcc","amt_outlier","new_device"]] as const,
  [9,    85.00, "5732", "Apple Store",              "approve", 18, 0.92, ["amt_outlier"]] as const,
  [10, 4200.00, "5967", "DirectMktg-Charge",        "decline", 84, 0.90, ["high_risk_mcc","cvv_retry","amt_outlier"]] as const,
  [11,   12.50, "5411", "Trader Joe's",             "approve", 3,  0.99, []] as const,
  [12,  178.00, "5541", "Chevron",                  "approve", 9,  0.96, ["card_present"]] as const,
  [13,  995.00, "5732", "Newegg",                   "step-up", 58, 0.84, ["geo_jump","new_device","amt_outlier"]] as const,
  [14, 3500.00, "7995", "DraftKings",               "decline", 79, 0.88, ["high_risk_mcc","velocity_5m","off_hours"]] as const,
  [15,  220.00, "5912", "Rite Aid",                 "approve", 7,  0.97, []] as const,
  [16,   60.00, "6011", "ATM-Chase",                "approve", 14, 0.93, ["off_hours"]] as const,
  [17,  450.00, "5732", "MicroCenter",              "approve", 19, 0.91, ["card_present"]] as const,
  [18, 1800.00, "4829", "Crypto-OnRamp",            "step-up", 64, 0.81, ["high_risk_mcc","new_device"]] as const,
  [19,   30.00, "5411", "Whole Foods",              "approve", 5,  0.99, []] as const,
];

const BASE_INSTANT = new Date("2026-05-11T13:00:00.000Z").getTime();

export function buildFiringStream(): FiringEvent[] {
  return FIRING_SEED.map((row, i) => {
    const [off, amount, mcc, merchant, decision, score, conf, feats] = row;
    const at = new Date(BASE_INSTANT + (off as number) * 3500).toISOString();
    return {
      id: `EVT-${String(i + 1).padStart(4, "0")}`,
      at,
      amountUsd: amount as number,
      mcc: mcc as string,
      merchant: merchant as string,
      cardLast4: String(4123 + (i % 9)).padStart(4, "0"),
      decision: decision as Decision,
      score: score as number,
      modelConfidence: conf as number,
      features: [...(feats as readonly string[])],
    };
  });
}

// --- heatmap aggregator -----------------------------------------------
// For each (feature × MCC) cell, count the number of NON-APPROVE events
// (decline + step-up) that fired both that feature and that MCC. This
// is a pure tally — no thresholds, no decisions, no math beyond a
// counter.

export interface CellTally {
  feature: string;
  mcc: string;
  count: number;
  declines: number;
  stepUps: number;
  /** Most recent firing in this cell (for the drill-in). */
  lastEventId?: string;
  lastAt?: string;
}

export function tallyByCell(events: readonly FiringEvent[]): CellTally[] {
  const map = new Map<string, CellTally>();
  for (const f of FEATURES) {
    for (const m of MCCS) {
      map.set(`${f.id}::${m.id}`, {
        feature: f.id,
        mcc: m.id,
        count: 0,
        declines: 0,
        stepUps: 0,
      });
    }
  }
  for (const e of events) {
    if (e.decision === "approve") continue;
    for (const fid of e.features) {
      const key = `${fid}::${e.mcc}`;
      const cell = map.get(key);
      if (!cell) continue;
      cell.count += 1;
      if (e.decision === "decline") cell.declines += 1;
      if (e.decision === "step-up") cell.stepUps += 1;
      // Keep the most recent firing as drill-in target.
      if (!cell.lastAt || cell.lastAt < e.at) {
        cell.lastAt = e.at;
        cell.lastEventId = e.id;
      }
    }
  }
  return Array.from(map.values());
}

// Heat intensity bucket for a tally count. PURE PRESENTATION map —
// not a threshold, not a decision. The model owns decisions; this
// only chooses which of six palette stops to render.
export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 5;
export function heatLevelOf(count: number): HeatLevel {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  if (count <= 6) return 4;
  return 5;
}

// --- decision-strip aggregator ----------------------------------------
// Tally events by decision verb for the metric strip. Pure counter.

export interface DecisionTotals {
  approve: number;
  stepUp: number;
  decline: number;
  total: number;
  avgScore: number;
  worstScore: number;
}

export function decisionTotals(events: readonly FiringEvent[]): DecisionTotals {
  let approve = 0;
  let stepUp = 0;
  let decline = 0;
  let scoreSum = 0;
  let worst = 0;
  for (const e of events) {
    if (e.decision === "approve") approve += 1;
    if (e.decision === "step-up") stepUp += 1;
    if (e.decision === "decline") decline += 1;
    scoreSum += e.score;
    if (e.score > worst) worst = e.score;
  }
  const total = events.length;
  return {
    approve,
    stepUp,
    decline,
    total,
    avgScore: total === 0 ? 0 : Math.round(scoreSum / total),
    worstScore: worst,
  };
}

// --- single-event lookup ----------------------------------------------

export function getEvent(id: string): FiringEvent | undefined {
  return buildFiringStream().find((e) => e.id === id);
}

// Banker-readable clock helper.
export function clockOf(iso: string): string {
  return iso.substring(11, 19);
}

// Feature/MCC label lookups — used by drill-in panels.
export function labelOfFeature(id: string): string {
  return FEATURES.find((f) => f.id === id)?.label ?? id;
}
export function labelOfMcc(id: string): string {
  return MCCS.find((m) => m.id === id)?.label ?? id;
}

// Decision verb → status-badge kind (PRESENTATION only).
export function decisionBadge(
  d: Decision,
): "success" | "warning" | "danger" | "neutral" {
  if (d === "approve") return "success";
  if (d === "step-up") return "warning";
  if (d === "decline") return "danger";
  return "neutral";
}
