// Option B — narrative-relationship view.
//
// Local self-contained data layer. nba-recommendations-test does not yet
// ship a `_shared/mock-data.ts` (the use case is brand-new — its REASONS
// canvas exists but the generator hasn't been run for the UC). Per the
// hard constraint "NO _vendor symlinks", this file is the single source
// of truth for option-B's render. It is pure data — no business logic,
// no thresholds computed, no decisions made.

export const USE_CASE_ID = "nba-recommendations-test";
export const CANVAS_SHA256 =
  "0922c405b8991a5ac6b88bb51530b438f3984ca31bb43b16f108f7d463c95e2e";
export const CONSOLE_PATTERN = "recommendations";

// ─── customer relationships ──────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  segment: "commercial" | "middle-market" | "small-business";
  rm: string;
  industry: string;
  geo: string;
  /** Relationship size — total exposure in USD */
  exposure_usd: number;
}

export const CUSTOMERS: Customer[] = [
  {
    id: "CUS-ACME",
    name: "Acme Corp",
    segment: "middle-market",
    rm: "Priya Subramanian",
    industry: "Specialty chemicals",
    geo: "NJ",
    exposure_usd: 28_000_000,
  },
  {
    id: "CUS-DELTA",
    name: "Delta Logistics",
    segment: "commercial",
    rm: "Marcus Reid",
    industry: "Freight forwarding",
    geo: "GA",
    exposure_usd: 64_000_000,
  },
  {
    id: "CUS-ORION",
    name: "Orion Manufacturing",
    segment: "middle-market",
    rm: "Priya Subramanian",
    industry: "Industrial OEM",
    geo: "OH",
    exposure_usd: 41_500_000,
  },
  {
    id: "CUS-VERTEX",
    name: "Vertex Healthcare Partners",
    segment: "commercial",
    rm: "Linh Tran",
    industry: "Specialty clinics",
    geo: "MA",
    exposure_usd: 92_000_000,
  },
  {
    id: "CUS-HORIZON",
    name: "Horizon Foods",
    segment: "small-business",
    rm: "Marcus Reid",
    industry: "Food distribution",
    geo: "TX",
    exposure_usd: 8_400_000,
  },
];

// ─── recommendation narratives (the heart of option B) ───────────────────

export type Urgency = "urgent" | "attention" | "routine";
export type RecType =
  | "extension"
  | "cross-sell"
  | "rate-reset"
  | "retention"
  | "covenant-watch";

export interface ActivityEvent {
  /** Plain-language narrative line: "Drew $1.2M on revolver" */
  text: string;
  at: string;
  /** Optional money figure for tabular-num alignment */
  amount?: string;
}

export interface EvidenceChip {
  id: string;
  label: string;
  /** "ok" / "warning" / "info" — drives StatusBadge kind */
  tone: "success" | "warning" | "info" | "danger" | "neutral";
}

export interface Recommendation {
  id: string;
  customerId: string;
  urgency: Urgency;
  type: RecType;
  typeLabel: string;
  /** Banker-friendly draft time string */
  draftedAt: string;
  /** Short headline above the narrative */
  headline: string;
  /** The story — first-person agent narrative */
  story: string;
  /** Recent activity timeline of the customer relationship */
  timeline: ActivityEvent[];
  /** What the agent proposes the RM do, in one sentence */
  proposal: string;
  /** Numeric size of the proposed action */
  proposalSize: string;
  /** Expected impact narrative */
  impact: string;
  /** Confidence 0..1 */
  confidence: number;
  /** Evidence chips supporting the story (safety + signal) */
  evidence: EvidenceChip[];
  /** Where accept routes */
  routeTo: string;
  /** Approval authority */
  approvalAuthority: string;
  /** Irrevocable flag — most NBA actions are reversible (just a queue) */
  irrevocable?: boolean;
}

export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: "REC-ACME-001",
    customerId: "CUS-ACME",
    urgency: "urgent",
    type: "extension",
    typeLabel: "Line extension",
    draftedAt: "12m ago",
    headline: "Acme Corp · pre-empt a competitor refi",
    story:
      "I noticed Acme Corp drew on their revolving line three times in the last 30 days. Their cash runway is now 90 days. Consider proposing a $5M extension before they shop competitors.",
    timeline: [
      { text: "Drew $1.2M on revolver", at: "Apr 12", amount: "$1.2M" },
      { text: "Drew $1.8M on revolver", at: "Apr 23", amount: "$1.8M" },
      { text: "Drew $2.1M on revolver", at: "May 04", amount: "$2.1M" },
      { text: "DSO crept to 58 days (peer median 41)", at: "May 06" },
      { text: "Treasury requested rate sheet from competitor", at: "May 09" },
    ],
    proposal:
      "Propose a $5M extension on the existing $10M revolver, holding pricing flat for 12 months.",
    proposalSize: "$5,000,000",
    impact:
      "Locks in relationship through next refi window. Modeled +$120K NIM / yr; competitor at L+185 vs our L+165.",
    confidence: 0.82,
    evidence: [
      { id: "ips", label: "Within RM authority", tone: "success" },
      { id: "covenant", label: "All covenants in compliance", tone: "success" },
      { id: "concentration", label: "Industry concentration OK", tone: "success" },
      { id: "competitor", label: "Competitor rate sheet detected", tone: "info" },
      { id: "fraud", label: "No fraud signal", tone: "success" },
    ],
    routeTo: "RM outreach queue",
    approvalAuthority: "RM",
  },
  {
    id: "REC-DELTA-001",
    customerId: "CUS-DELTA",
    urgency: "urgent",
    type: "retention",
    typeLabel: "Retention",
    draftedAt: "27m ago",
    headline: "Delta Logistics · ACH volume drifting to a peer bank",
    story:
      "Delta's ACH volume through our cash management dropped 38% over the last 60 days, while their treasury team opened a money market account at a peer bank. They are still our borrower of record but the operating relationship is leaving the building.",
    timeline: [
      { text: "ACH volume $14M / mo (was $22M)", at: "Mar", amount: "$14M" },
      { text: "New positive-pay enrollment at peer bank", at: "Apr 02" },
      { text: "Cancelled lockbox add-on with us", at: "Apr 18" },
      { text: "Treasurer attended peer roadshow", at: "May 01" },
    ],
    proposal:
      "Schedule a retention call this week; propose treasury rebate of 8 bps on operating account in exchange for 24-month ACH commitment.",
    proposalSize: "8 bps rebate",
    impact:
      "Defends $0.9M / yr in fees + $64M exposure. Cost of retention modeled at $52K / yr — payback 7 weeks.",
    confidence: 0.76,
    evidence: [
      { id: "ips", label: "Within RM authority", tone: "success" },
      { id: "fee-recovery", label: "Fee recovery modeled", tone: "info" },
      { id: "concentration", label: "No concentration concern", tone: "success" },
      { id: "fraud", label: "No fraud signal", tone: "success" },
    ],
    routeTo: "RM outreach queue",
    approvalAuthority: "RM",
  },
  {
    id: "REC-ORION-001",
    customerId: "CUS-ORION",
    urgency: "attention",
    type: "cross-sell",
    typeLabel: "Cross-sell",
    draftedAt: "1h ago",
    headline: "Orion Manufacturing · FX hedging fit",
    story:
      "Orion booked a EUR-denominated supply contract worth approximately $8M last quarter. They are currently unhedged. We have a standing FX desk relationship with their parent — extending to Orion is a one-call introduction.",
    timeline: [
      { text: "Signed €7.4M supply contract w/ German OEM", at: "Q1" },
      { text: "EUR/USD volatility 14% last 90d", at: "ongoing" },
      { text: "Parent uses our FX desk for $40M / yr", at: "ongoing" },
    ],
    proposal:
      "Introduce FX desk; propose a 12-month forward strip for €600K / mo at indicative 1.0840.",
    proposalSize: "€7.2M notional",
    impact:
      "Estimated $35K-$60K in fee revenue. Eliminates an unmeasured FX risk on Orion's book.",
    confidence: 0.71,
    evidence: [
      { id: "suitability", label: "Suitability OK (hedge, not speculation)", tone: "success" },
      { id: "parent-rel", label: "Parent relationship in good standing", tone: "info" },
      { id: "concentration", label: "Within FX desk concentration", tone: "success" },
    ],
    routeTo: "FX desk handoff",
    approvalAuthority: "RM",
  },
  {
    id: "REC-VERTEX-001",
    customerId: "CUS-VERTEX",
    urgency: "attention",
    type: "rate-reset",
    typeLabel: "Rate reset",
    draftedAt: "3h ago",
    headline: "Vertex Healthcare · approaching rate reset window",
    story:
      "Vertex's $40M term loan resets in 75 days. Current coupon SOFR+225; market for their risk band today is SOFR+250-275. They are profitable, well-covenanted, and have meaningfully de-levered since origination — a soft reset (SOFR+235) is a reasonable defensive offer.",
    timeline: [
      { text: "Leverage 3.1x → 2.4x over 18 months", at: "ongoing" },
      { text: "Repaid $4M scheduled amort on time", at: "Apr 01" },
      { text: "Reset window opens", at: "Jul 24" },
    ],
    proposal:
      "Propose SOFR+235 reset, holding remaining tenor flat. Margin friend-of-relationship; defends against refi shopping.",
    proposalSize: "SOFR+235",
    impact:
      "Captures +10 bps over current; concedes 15-40 bps vs new-money market. Saves an estimated 4 weeks of refi cycle effort.",
    confidence: 0.69,
    evidence: [
      { id: "ips", label: "Within RM authority", tone: "success" },
      { id: "covenant", label: "All covenants in compliance", tone: "success" },
      { id: "leverage", label: "Leverage trending down", tone: "success" },
      { id: "concentration", label: "Healthcare concentration OK", tone: "success" },
    ],
    routeTo: "RM outreach queue",
    approvalAuthority: "RM",
  },
  {
    id: "REC-HORIZON-001",
    customerId: "CUS-HORIZON",
    urgency: "routine",
    type: "covenant-watch",
    typeLabel: "Covenant watch",
    draftedAt: "5h ago",
    headline: "Horizon Foods · soft covenant chatter, no breach",
    story:
      "Horizon's Q1 fixed-charge coverage came in at 1.18x vs a covenant of 1.10x — still in compliance but thinning. Their distribution to one large customer is up to 31% of revenue. Worth a check-in call; no action required this week.",
    timeline: [
      { text: "FCC 1.34x → 1.22x → 1.18x", at: "Q3-Q1" },
      { text: "Top customer concentration 31% (was 24%)", at: "Q1" },
      { text: "On-time payment, all facilities", at: "ongoing" },
    ],
    proposal:
      "Log a soft check-in on the RM's call schedule for next month. No proactive structure change.",
    proposalSize: "—",
    impact: "Trust-building; positions the bank for an early conversation if Q2 trends down further.",
    confidence: 0.64,
    evidence: [
      { id: "covenant", label: "Covenants in compliance", tone: "warning" },
      { id: "concentration", label: "Customer concentration rising", tone: "warning" },
      { id: "payment", label: "Payments on time", tone: "success" },
    ],
    routeTo: "RM CRM (log)",
    approvalAuthority: "RM",
  },
];

// ─── safety rails (right rail) ───────────────────────────────────────────

export const SAFETY_RAILS: string[] = [
  "Every recommendation gated by RM authority check",
  "Concentration limits enforced before draft",
  "No auto-execution — all routes through RM after your Accept",
  "Rejection reasons logged for agent prompt review",
  "Customer-PII redacted in agent traces",
];

// ─── review pattern (user calibration) ───────────────────────────────────

export const REVIEW_PATTERN = {
  accepted_as_drafted: { count: 87, pct: 68 },
  accepted_with_edits: { count: 19, pct: 15 },
  deferred:            { count: 14, pct: 11 },
  rejected:            {  count: 8,  pct: 6 },
};

// ─── agent learning (right rail) ─────────────────────────────────────────

export const AGENT_LEARNING = {
  observation:
    "You rejected 3 rate-reset proposals in the last 30 days where the proposed margin moved less than 5 bps. Agent has tightened its minimum-margin-move threshold.",
  appliedAt: "May 02",
};

// ─── HITL gate registry (for the approval flow) ──────────────────────────

export interface HITLGate {
  id: string;
  label: string;
  triggers: string;
  authority: string;
}

export const HITL_GATES: HITLGate[] = [
  {
    id: "rm-disposition",
    label: "RM disposition",
    triggers: "Every drafted recommendation",
    authority: "RM",
  },
  {
    id: "credit-review",
    label: "Credit review",
    triggers: "Recommendations that move exposure > $5M",
    authority: "Credit officer",
  },
];

// ─── lookups ─────────────────────────────────────────────────────────────

export function getCustomer(id: string): Customer | undefined {
  return CUSTOMERS.find((c) => c.id === id);
}

export function getRecommendation(id: string): Recommendation | undefined {
  // Accept lookup by id verbatim, or by customerId for /case/[id] convenience.
  return (
    RECOMMENDATIONS.find((r) => r.id === id) ??
    RECOMMENDATIONS.find((r) => r.customerId === id)
  );
}

export function dispositionMetrics() {
  return [
    {
      id: "queue",
      label: "Awaiting review",
      value: RECOMMENDATIONS.length,
      state: "ok" as const,
    },
    {
      id: "urgent",
      label: "Urgent",
      value: RECOMMENDATIONS.filter((r) => r.urgency === "urgent").length,
      state: "alert" as const,
    },
    {
      id: "accept_rate",
      label: "Accepted · 30d",
      value: REVIEW_PATTERN.accepted_as_drafted.pct + REVIEW_PATTERN.accepted_with_edits.pct,
      unit: "%",
      trend: 1 as const,
    },
    {
      id: "exposure",
      label: "Book exposure",
      value: "$233M",
      trend: 0 as const,
    },
    {
      id: "opportunity",
      label: "Opportunity sizing",
      value: "$8.4M",
      unit: "in flight",
      trend: 1 as const,
    },
  ];
}
