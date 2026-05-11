// Option C - inline-evidence narrative.
//
// Data layer is read-only. Every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. Adapters BELOW the re-export bar are pure shape
// transforms (events -> narrative claims with citations) - no business
// logic, no math, no decisions.

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

// =====================================================================
// Citation evidence shape
// =====================================================================
// A citation is ONE piece of source evidence that supports ONE claim in
// the SAR narrative. Every citation must declare:
//   - a stable id (used as anchor + key)
//   - the source-of-record category (txn / account / geo / agent / rule)
//   - a short label rendered inside the chip ([txn 04891], [acct AH-3])
//   - a one-line title + body for the expanded card
//   - a backing event index where the regulator can trace the evidence
//
// No business decisions, no scoring - the regulatory-narrator AGENT
// produced this set; the UI only renders it.

export type CitationKind =
  | "transaction"
  | "account"
  | "geography"
  | "agent"
  | "rule"
  | "service";

export interface Citation {
  id: string;
  kind: CitationKind;
  /** Short label rendered inside the chip, e.g. "txn 04891" */
  label: string;
  /** Headline for the expanded panel */
  title: string;
  /** One paragraph of detail */
  body: string;
  /** Optional structured fields shown as a key/value list */
  fields?: { k: string; v: string }[];
  /** Event index in PIPELINE_EVENTS that produced this citation (so the
   *  auditor can scrub back to the row that generated it). */
  eventIdx?: number;
}

// =====================================================================
// Claim shape
// =====================================================================
// A claim is ONE assertion in the SAR narrative. It has:
//   - id (stable for inline anchoring)
//   - section (header / pattern / parties / geography / disposition)
//   - the prose text
//   - an ordered list of citation ids backing the prose
//
// The drafter agent assembled these claims; UI only renders them.

export type ClaimSection =
  | "header"
  | "pattern"
  | "parties"
  | "geography"
  | "disposition";

export interface NarrativeClaim {
  id: string;
  section: ClaimSection;
  /** Banker-readable section label */
  sectionLabel: string;
  /** Prose for the claim - rendered as a paragraph in the section */
  prose: string;
  /** Citations attached to this claim, in display order */
  citationIds: string[];
  /** Pre-shaped "what this claim is asserting" tooltip */
  assertion: string;
}

// =====================================================================
// Section ordering + display labels (banker vocabulary)
// =====================================================================

export const SECTION_ORDER: ClaimSection[] = [
  "header",
  "pattern",
  "parties",
  "geography",
  "disposition",
];

export const SECTION_LABEL: Record<ClaimSection, string> = {
  header:      "Filing summary",
  pattern:     "Suspicious pattern",
  parties:     "Parties of interest",
  geography:   "Geography & jurisdiction",
  disposition: "Recommended disposition",
};

// =====================================================================
// Citation library
// =====================================================================
// Hand-assembled from the canvas: PIPELINE_EVENTS confirms which agents
// and services ran; the narrative cites their outputs. Every body string
// reads as what an examiner would expect to see when drilling in.

export const CITATIONS: Record<string, Citation> = {
  // Transaction evidence (the source-of-record for the velocity spike)
  "txn-04891": {
    id: "txn-04891",
    kind: "transaction",
    label: "txn 04891",
    title: "Wire-out transaction batch",
    body:
      "14 outbound wires totalling $187,400 over 14 days, each individually $9,400-$9,900. Pattern is consistent with structuring beneath the $10,000 CTR threshold.",
    fields: [
      { k: "count",        v: "14 transactions" },
      { k: "total_usd",    v: "$187,400" },
      { k: "per_txn_band", v: "$9,400 - $9,900" },
      { k: "window_days",  v: "14" },
    ],
    eventIdx: 7,
  },
  "txn-velocity": {
    id: "txn-velocity",
    kind: "transaction",
    label: "velocity",
    title: "Velocity-spike alert",
    body:
      "Velocity score 0.94 against the borrower's trailing-90-day baseline of 0.21. Threshold for alert is 0.60. The alert that opened this case fired on this signal.",
    fields: [
      { k: "score_now",      v: "0.94" },
      { k: "score_baseline", v: "0.21 (90d)" },
      { k: "threshold",      v: "0.60" },
    ],
    eventIdx: 6,
  },

  // Account / customer history
  "acct-ah-3": {
    id: "acct-ah-3",
    kind: "account",
    label: "acct AH-3",
    title: "Account history",
    body:
      "Account opened 2019-03; prior 12 months show no outbound wires > $5,000. Profile declared as `manufacturing operating account`. No previous SAR or 314(a) match on file.",
    fields: [
      { k: "opened",          v: "2019-03" },
      { k: "prior_wires_max", v: "$4,920 (last 12mo)" },
      { k: "declared_use",    v: "Manufacturing operating" },
      { k: "prior_sars",      v: "0" },
    ],
    eventIdx: 6,
  },

  // Geography signal
  "geo-mx": {
    id: "geo-mx",
    kind: "geography",
    label: "geo MX",
    title: "Beneficiary geography signal",
    body:
      "11 of 14 wires destined to two beneficiary accounts in jurisdictions on the FinCEN heightened-scrutiny list (concentration > 78%). No business explanation declared on the wire memos.",
    fields: [
      { k: "destinations",        v: "2 beneficiaries" },
      { k: "high_risk_share",     v: "78.5%" },
      { k: "fincen_list_match",   v: "yes (2026-Q1 list)" },
    ],
    eventIdx: 8,
  },

  // Agent reasoning citations
  "agent-categorizer": {
    id: "agent-categorizer",
    kind: "agent",
    label: "categorizer",
    title: "complaint-categorizer reasoning",
    body:
      "Classified pattern as `structuring + cross-border`. Confidence 0.91. Reasoning chain cited the velocity-spike and the per-transaction amount band as the dominant signals.",
    fields: [
      { k: "category",    v: "structuring + cross-border" },
      { k: "confidence",  v: "0.91" },
      { k: "tokens_in",   v: "8,000" },
      { k: "tokens_out",  v: "3,500" },
    ],
    eventIdx: 9,
  },
  "agent-screener": {
    id: "agent-screener",
    kind: "agent",
    label: "screener",
    title: "insider-screener finding",
    body:
      "No insider relationship detected between the borrower, the beneficiary accounts, or anyone on the bank's Reg O list. Screen completed against the full insider-network graph.",
    fields: [
      { k: "insider_match", v: "none" },
      { k: "reg_o_check",   v: "clear" },
    ],
    eventIdx: 10,
  },
  "agent-narrator": {
    id: "agent-narrator",
    kind: "agent",
    label: "narrator",
    title: "regulatory-narrator drafting log",
    body:
      "Produced the FinCEN-compliant narrative skeleton, attaching one citation to each claim. The drafter then expanded the skeleton into the prose you see in this report.",
    fields: [
      { k: "skeleton_claims", v: "12" },
      { k: "citations_per_claim_min", v: "1" },
    ],
    eventIdx: 11,
  },

  // Service evidence (atomic compute that the agents called)
  "svc-borrower-network": {
    id: "svc-borrower-network",
    kind: "service",
    label: "borrower-network",
    title: "borrower-network service",
    body:
      "Returned the borrower's outbound wire graph for the trailing 90 days, including beneficiary accounts and the velocity-score series.",
    fields: [
      { k: "latency_ms", v: "697" },
      { k: "nodes",      v: "184" },
      { k: "edges",      v: "240" },
    ],
    eventIdx: 6,
  },
  "svc-exposure": {
    id: "svc-exposure",
    kind: "service",
    label: "exposure-aggregator",
    title: "exposure-aggregator service",
    body:
      "Confirmed the consolidated wire exposure stays under the single-borrower limit. No exposure-rule breach.",
    fields: [
      { k: "latency_ms",  v: "968" },
      { k: "exposure_pct_of_limit", v: "37%" },
    ],
    eventIdx: 7,
  },
  "svc-peer": {
    id: "svc-peer",
    kind: "service",
    label: "peer-and-industry",
    title: "peer-and-industry-context service",
    body:
      "Velocity-spike score is a 4.5 sigma outlier against the NAICS-33 manufacturing peer set over the same 14-day window.",
    fields: [
      { k: "latency_ms",     v: "436" },
      { k: "peer_z_score",   v: "4.5" },
      { k: "peer_set_size",  v: "812" },
    ],
    eventIdx: 8,
  },

  // Rule citations
  "rule-reg-o": {
    id: "rule-reg-o",
    kind: "rule",
    label: "reg O",
    title: "Reg O individual limit",
    body:
      "Verdict: watch. The aggregate beneficiary exposure is below the regulatory threshold, but the per-counterparty concentration meets the watch condition. Surfaced for review, not breach.",
    fields: [
      { k: "verdict",    v: "watch" },
      { k: "threshold",  v: "see rules/reg_o_individual_limit.json" },
    ],
  },
  "rule-insider-aggregate": {
    id: "rule-insider-aggregate",
    kind: "rule",
    label: "insider agg",
    title: "Insider aggregate limit",
    body: "Verdict: pass. No insider relationship found by the screener; the rule fires as a no-op.",
    fields: [
      { k: "verdict", v: "pass" },
    ],
  },
};

// =====================================================================
// Narrative claims
// =====================================================================
// One claim per assertion the analyst will read top-to-bottom. Each
// claim is grounded by 1..n citation ids - all of which must resolve to
// entries in CITATIONS above. The auditor blocks unresolved ids.

export const CLAIMS: NarrativeClaim[] = [
  // ---- Filing summary ----
  {
    id: "c-summary-1",
    section: "header",
    sectionLabel: SECTION_LABEL.header,
    prose:
      "Lincoln Electric Holdings (BRW-LECO) is the subject of this filing. The bank's BSA program identified a velocity-spike alert in the borrower's outbound wire activity on 2026-05-09.",
    citationIds: ["txn-velocity", "acct-ah-3"],
    assertion: "Subject is identified; alert origin is the velocity-spike signal.",
  },
  {
    id: "c-summary-2",
    section: "header",
    sectionLabel: SECTION_LABEL.header,
    prose:
      "The case was opened at 08:00 UTC; investigation completed within the same business day; the 30-day SAR clock starts on the date of filing approval.",
    citationIds: ["agent-narrator"],
    assertion: "Regulatory clock starts on approval; investigation completed same-day.",
  },

  // ---- Suspicious pattern ----
  {
    id: "c-pattern-1",
    section: "pattern",
    sectionLabel: SECTION_LABEL.pattern,
    prose:
      "Between 2026-04-25 and 2026-05-08, the borrower originated 14 outbound wires totalling $187,400, each individually in the $9,400-$9,900 band - immediately beneath the $10,000 currency-transaction-report threshold.",
    citationIds: ["txn-04891", "agent-categorizer"],
    assertion: "Pattern of structured wires, each beneath the CTR threshold.",
  },
  {
    id: "c-pattern-2",
    section: "pattern",
    sectionLabel: SECTION_LABEL.pattern,
    prose:
      "The pattern represents a 4.5 sigma deviation from the borrower's 90-day baseline and from the NAICS-33 manufacturing peer set over the same window.",
    citationIds: ["txn-velocity", "svc-peer"],
    assertion: "Statistical outlier vs. own baseline and against peer set.",
  },

  // ---- Parties of interest ----
  {
    id: "c-parties-1",
    section: "parties",
    sectionLabel: SECTION_LABEL.parties,
    prose:
      "The originator account (AH-3) has no comparable wire activity in the prior 12 months; the declared purpose is `manufacturing operating account`. No prior SAR is on file.",
    citationIds: ["acct-ah-3"],
    assertion: "Originator profile is inconsistent with the observed activity.",
  },
  {
    id: "c-parties-2",
    section: "parties",
    sectionLabel: SECTION_LABEL.parties,
    prose:
      "Wires concentrate on two beneficiary accounts not previously transacted with by the originator. The insider-screener finds no Reg O or insider relationship; the aggregate exposure rule passes.",
    citationIds: ["agent-screener", "rule-insider-aggregate", "svc-borrower-network"],
    assertion: "Beneficiary set is new; no insider involvement.",
  },

  // ---- Geography ----
  {
    id: "c-geo-1",
    section: "geography",
    sectionLabel: SECTION_LABEL.geography,
    prose:
      "Eleven of fourteen wires (78.5% of dollar value) terminate in two beneficiary accounts in jurisdictions on the FinCEN 2026-Q1 heightened-scrutiny list. The wire memos contain no business rationale for the cross-border activity.",
    citationIds: ["geo-mx", "svc-borrower-network"],
    assertion: "Beneficiary geography concentrates in FinCEN-listed jurisdictions.",
  },
  {
    id: "c-geo-2",
    section: "geography",
    sectionLabel: SECTION_LABEL.geography,
    prose:
      "The Reg O individual-limit rule registers a `watch` verdict on per-counterparty concentration, surfaced for review and not a breach.",
    citationIds: ["rule-reg-o"],
    assertion: "Regulatory concentration on a counterparty - on watch, not breach.",
  },

  // ---- Recommended disposition ----
  {
    id: "c-disp-1",
    section: "disposition",
    sectionLabel: SECTION_LABEL.disposition,
    prose:
      "Recommended disposition: FILE SAR. The pattern (structuring + cross-border concentration), the magnitude (4.5 sigma versus peer baseline), and the absence of a declared business rationale jointly meet the program's filing threshold.",
    citationIds: ["agent-categorizer", "txn-04891", "svc-peer", "geo-mx"],
    assertion: "Recommended disposition is FILE; cites all four supporting signals.",
  },
  {
    id: "c-disp-2",
    section: "disposition",
    sectionLabel: SECTION_LABEL.disposition,
    prose:
      "Final approval is irrevocable - filing posts the SAR to FinCEN and starts the customer-notification 30-day clock.",
    citationIds: ["agent-narrator"],
    assertion: "Approval action is irrevocable; downstream notification clock starts.",
  },
];

// =====================================================================
// Pure adapters - sanity helpers used by the UI
// =====================================================================

export function citationsForClaim(claim: NarrativeClaim): Citation[] {
  return claim.citationIds
    .map((id) => CITATIONS[id])
    .filter((c): c is Citation => Boolean(c));
}

export function claimsBySection(): Record<ClaimSection, NarrativeClaim[]> {
  const out: Record<ClaimSection, NarrativeClaim[]> = {
    header: [],
    pattern: [],
    parties: [],
    geography: [],
    disposition: [],
  };
  for (const c of CLAIMS) out[c.section].push(c);
  return out;
}

// =====================================================================
// Surface counts for the metric strip - read straight off the spine
// =====================================================================

export interface NarrativeSummary {
  claimCount: number;
  citationCount: number;
  agentCount: number;
  serviceCount: number;
  ruleCount: number;
}

export function summarizeNarrative(): NarrativeSummary {
  const all = new Set<string>();
  for (const c of CLAIMS) for (const id of c.citationIds) all.add(id);
  let agents = 0;
  let services = 0;
  let rules = 0;
  for (const id of all) {
    const c = CITATIONS[id];
    if (!c) continue;
    if (c.kind === "agent") agents += 1;
    if (c.kind === "service") services += 1;
    if (c.kind === "rule") rules += 1;
  }
  return {
    claimCount: CLAIMS.length,
    citationCount: all.size,
    agentCount: agents,
    serviceCount: services,
    ruleCount: rules,
  };
}

// =====================================================================
// HITL gate state derived from events (pure read; no decisions)
// =====================================================================

export interface GateState {
  id: string;
  label: string;
  status: "completed" | "pending" | "queued";
  decision?: string;
  decidedAt?: string;
}

const GATE_LABEL: Record<string, string> = {
  final_approval: "Final approval (file SAR)",
};

interface RawEvt {
  at: string;
  kind: string;
  gate?: string;
  decision?: string;
}

export function gateStates(
  events: readonly RawEvt[],
  hitlGates: readonly string[],
): GateState[] {
  return hitlGates.map((g) => {
    const pending = events.find(
      (e) => e.kind === "human_action_pending" && e.gate === g,
    );
    const decided = events.find(
      (e) => e.kind === "human_action" && e.gate === g,
    );
    if (decided) {
      return {
        id: g,
        label: GATE_LABEL[g] ?? g,
        status: "completed" as const,
        decision: decided.decision,
        decidedAt: decided.at,
      };
    }
    if (pending) {
      return {
        id: g,
        label: GATE_LABEL[g] ?? g,
        status: "pending" as const,
      };
    }
    return { id: g, label: GATE_LABEL[g] ?? g, status: "queued" as const };
  });
}

// =====================================================================
// Case lookup
// =====================================================================

export interface CaseRecord {
  id: string;
  title: string;
  borrower: Borrower;
  current_stage: string;
  decision: string;
  decision_kind: string;
  hitl_gates: readonly string[];
  rule_verdicts: Record<string, "pass" | "watch" | "fail" | "skip">;
  events: readonly RawEvt[];
  /** Investigation start (alert open). */
  alertOpenedAt: string;
  /** 30-day SAR clock deadline relative to alertOpenedAt. */
  sarDeadline: string;
}

/** Pure function - given an ISO timestamp, add `days` days, return ISO. */
function plusDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function getCase(id: string): CaseRecord {
  const opened = LIVE_CASE.events[0]?.at ?? "2026-05-09T08:00:00.000Z";
  return {
    id: id || LIVE_CASE.id,
    title: LIVE_CASE.title,
    borrower: LIVE_CASE.borrower,
    current_stage: LIVE_CASE.current_stage,
    decision: LIVE_CASE.decision,
    decision_kind: LIVE_CASE.decision_kind,
    hitl_gates: LIVE_CASE.hitl_gates,
    rule_verdicts: LIVE_CASE.rule_verdicts,
    events: LIVE_CASE.events as readonly RawEvt[],
    alertOpenedAt: opened,
    sarDeadline: plusDaysIso(opened, 30),
  };
}
