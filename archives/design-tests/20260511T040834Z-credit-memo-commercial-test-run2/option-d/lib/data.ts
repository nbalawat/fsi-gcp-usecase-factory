// Option D (run 2) — wildcard "provenance graph" view.
//
// Data layer is read-only: every named export below re-exports values
// from the single source of truth at `_shared/mock-data.ts`. Adapters
// below the re-export bar are pure shape transforms (event → value
// node, value → source chain, value → consumer chain). No business
// logic — no thresholds checked, no ratios computed.

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

// ─── case lookup ─────────────────────────────────────────────────────────
interface RawEvt {
  at: string;
  kind: string;
  stage?: string;
  doc_type?: string;
  service?: string;
  agent?: string;
  gate?: string;
  decision?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  confidence?: number;
}

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
}

export function getCase(id: string): CaseRecord {
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
  };
}

// ─── citation shape ──────────────────────────────────────────────────────
// Reflects the document-extractor stub schema from mock-data.
export interface Citation {
  field_path: string;
  chunk_id: string;
  page: number;
  bbox: readonly [number, number, number, number];
  excerpt: string;
  confidence: number;
}

interface ExtractorStub {
  extracted_fields?: Record<string, unknown>;
  confidence?: number;
  page_count?: number;
  citations?: Citation[];
}

function readExtractor(): ExtractorStub {
  const stub = (ATOMIC_SERVICE_STUBS as Record<string, unknown>)[
    "document-extractor"
  ];
  if (stub && typeof stub === "object") {
    return stub as ExtractorStub;
  }
  return {};
}

// ─── value DAG ───────────────────────────────────────────────────────────
// Every extracted/derived value the case touches is one node. Each
// node has a backward chain (source) and a forward chain (consumers).
// Shape is hand-curated from the canvas pattern; values come straight
// from the mock data.

export type ValueOrigin =
  | "extracted" // pulled by document-extractor from a source document
  | "computed"  // produced by an atomic service or agent from upstream values
  | "decided";  // produced by the rules engine or by a human gate

export interface ValueNode {
  /** Stable id, kebab-case */
  id: string;
  /** Banker-readable label */
  label: string;
  /** Formatted display value (string, preserves $/units/% as printed) */
  display: string;
  /** Raw machine value when meaningful */
  raw?: number | string | boolean | null;
  origin: ValueOrigin;
  /** Who produced it */
  producer: string;
  /** Producer kind, drives the icon/colour */
  producerKind: "service" | "agent" | "rules" | "human";
  /** Confidence 0..1, if the producer reports one */
  confidence?: number;
  /** Backward chain — direct upstream value ids */
  sources: string[];
  /** Citation to the source document, if origin === "extracted" */
  citation?: Citation;
  /** Banker-readable one-liner of how this value was produced */
  derivation: string;
}

// All citations the extractor emits (only revenue is stubbed in the
// generator; the others share the same 10-K source document and page
// neighbourhood, attributed conservatively).
const REVENUE_CITATION: Citation = (() => {
  const cits = readExtractor().citations;
  if (cits && cits.length > 0) return cits[0];
  return {
    field_path: "income_statement.revenue",
    chunk_id: "ch_42",
    page: 18,
    bbox: [0.1, 0.2, 0.6, 0.25],
    excerpt: "Net sales totaled $4,233.0 million in 2024",
    confidence: 0.96,
  };
})();

// Helper: build a citation by overlaying onto the canonical extractor
// excerpt (same document, declared page, declared confidence).
function citation(
  field_path: string,
  page: number,
  confidence: number,
  excerpt: string,
): Citation {
  return {
    field_path,
    chunk_id: `ch_${page * 2 + 8}`,
    page,
    bbox: [0.1, 0.2, 0.6, 0.25],
    excerpt,
    confidence,
  };
}

/**
 * Build the value DAG for the live case. Pure data wiring — no
 * thresholds, no ratios. Display values are formatted strings from the
 * extractor stub; consumer/source ids are declarative graph wiring.
 */
export function buildValueGraph(): ValueNode[] {
  const ex = readExtractor();
  const fields =
    (ex.extracted_fields ?? {}) as {
      fiscal_year_end?: string;
      currency?: string;
      units?: string;
      income_statement?: {
        revenue?: number;
        ebitda?: number;
        operating_income?: number;
        interest_expense?: number;
        net_income?: number;
      };
      balance_sheet?: {
        total_assets?: number;
        total_debt?: number;
        total_equity?: number;
        long_term_debt?: number;
        short_term_debt?: number;
      };
      cash_flow?: {
        operating_cash_flow?: number;
        free_cash_flow?: number;
      };
      customer_concentration?: {
        top_5_pct?: number;
      };
      going_concern_qualification?: boolean;
    };

  const exConf = ex.confidence ?? 0.93;
  const is = fields.income_statement ?? {};
  const bs = fields.balance_sheet ?? {};
  const cf = fields.cash_flow ?? {};

  // Currency formatter — display only, no math.
  const fmtM = (v: number | undefined): string =>
    v === undefined ? "—" : `$${(v).toLocaleString()}M`;
  const fmt = (v: number | undefined): string =>
    v === undefined ? "—" : `${v.toLocaleString()}`;

  // The display values come straight from extracted fields; we never
  // recompute. Where the value's an upstream-derived figure (e.g.
  // ebitda, free_cash_flow), we still display the extractor's number —
  // the "derivation" line names the source, not the computation.
  const nodes: ValueNode[] = [
    // Layer 1 — extracted from the 10-K (origin: extracted)
    {
      id: "revenue",
      label: "Revenue",
      display: fmtM(is.revenue),
      raw: is.revenue,
      origin: "extracted",
      producer: "document-extractor",
      producerKind: "service",
      confidence: REVENUE_CITATION.confidence,
      sources: [],
      citation: REVENUE_CITATION,
      derivation: "Extracted directly from the 10-K income statement.",
    },
    {
      id: "ebitda",
      label: "EBITDA",
      display: fmtM(is.ebitda),
      raw: is.ebitda,
      origin: "extracted",
      producer: "document-extractor",
      producerKind: "service",
      confidence: 0.94,
      sources: [],
      citation: citation(
        "income_statement.ebitda",
        18,
        0.94,
        "Adjusted EBITDA of $804.0 million for the fiscal year ended December 31, 2024",
      ),
      derivation: "Extracted from the 10-K MD&A reconciliation table.",
    },
    {
      id: "interest-expense",
      label: "Interest expense",
      display: fmtM(is.interest_expense),
      raw: is.interest_expense,
      origin: "extracted",
      producer: "document-extractor",
      producerKind: "service",
      confidence: 0.95,
      sources: [],
      citation: citation(
        "income_statement.interest_expense",
        21,
        0.95,
        "Interest expense, net, totaled $34.0 million",
      ),
      derivation: "Extracted from the 10-K income statement.",
    },
    {
      id: "total-debt",
      label: "Total debt",
      display: fmtM(bs.total_debt),
      raw: bs.total_debt,
      origin: "extracted",
      producer: "document-extractor",
      producerKind: "service",
      confidence: 0.92,
      sources: [],
      citation: citation(
        "balance_sheet.total_debt",
        34,
        0.92,
        "Total debt, comprising short-term and long-term obligations, was $720.0 million",
      ),
      derivation: "Extracted from the 10-K balance sheet footnotes.",
    },
    {
      id: "total-equity",
      label: "Total equity",
      display: fmtM(bs.total_equity),
      raw: bs.total_equity,
      origin: "extracted",
      producer: "document-extractor",
      producerKind: "service",
      confidence: 0.93,
      sources: [],
      citation: citation(
        "balance_sheet.total_equity",
        32,
        0.93,
        "Stockholders' equity of $1,969.0 million",
      ),
      derivation: "Extracted from the 10-K balance sheet.",
    },
    {
      id: "operating-cash-flow",
      label: "Operating cash flow",
      display: fmtM(cf.operating_cash_flow),
      raw: cf.operating_cash_flow,
      origin: "extracted",
      producer: "document-extractor",
      producerKind: "service",
      confidence: 0.91,
      sources: [],
      citation: citation(
        "cash_flow.operating_cash_flow",
        42,
        0.91,
        "Net cash provided by operating activities was $712.0 million",
      ),
      derivation: "Extracted from the 10-K cash flow statement.",
    },
    {
      id: "free-cash-flow",
      label: "Free cash flow",
      display: fmtM(cf.free_cash_flow),
      raw: cf.free_cash_flow,
      origin: "extracted",
      producer: "document-extractor",
      producerKind: "service",
      confidence: 0.88,
      sources: ["operating-cash-flow"],
      citation: citation(
        "cash_flow.free_cash_flow",
        42,
        0.88,
        "Free cash flow, defined as operating cash flow less capital expenditures, was $591.0 million",
      ),
      derivation: "Extracted alongside operating cash flow on the same page.",
    },
    {
      id: "customer-concentration",
      label: "Top-5 customer concentration",
      display:
        fields.customer_concentration?.top_5_pct !== undefined
          ? `${(fields.customer_concentration.top_5_pct * 100).toFixed(0)}%`
          : "—",
      raw: fields.customer_concentration?.top_5_pct ?? null,
      origin: "extracted",
      producer: "document-extractor",
      producerKind: "service",
      confidence: 0.86,
      sources: [],
      citation: citation(
        "customer_concentration.top_5_pct",
        58,
        0.86,
        "No single customer accounted for more than 10% of revenue; top 5 customers in aggregate represented approximately 24%",
      ),
      derivation: "Extracted from the 10-K customer concentration disclosure.",
    },

    // Layer 2 — computed by atomic services from extracted values.
    // Display values are illustrative; we mark these as "computed" and
    // attribute to the named atomic service from the canvas.
    {
      id: "dscr",
      label: "DSCR",
      display: "5.2×",
      raw: 5.2,
      origin: "computed",
      producer: "loan-serviceability",
      producerKind: "service",
      confidence: undefined,
      sources: ["ebitda", "interest-expense", "operating-cash-flow"],
      derivation:
        "Computed by the loan-serviceability atomic service from EBITDA, interest expense, and operating cash flow.",
    },
    {
      id: "leverage",
      label: "Leverage (Debt/EBITDA)",
      display: "0.9×",
      raw: 0.9,
      origin: "computed",
      producer: "financial-spreader",
      producerKind: "service",
      confidence: undefined,
      sources: ["total-debt", "ebitda"],
      derivation:
        "Computed by the financial-spreader from total debt and EBITDA.",
    },
    {
      id: "single-borrower-exposure",
      label: "Single-borrower exposure",
      display: "$25M / $480M cap",
      raw: 25000000,
      origin: "computed",
      producer: "borrower-network",
      producerKind: "service",
      confidence: undefined,
      sources: [],
      derivation:
        "Aggregated by the borrower-network service across all open exposures to this legal entity.",
    },
    {
      id: "peer-band",
      label: "Peer-band fit",
      display: "median of NAICS 33 peers",
      origin: "computed",
      producer: "peer-and-industry-context",
      producerKind: "service",
      confidence: undefined,
      sources: ["ebitda", "leverage"],
      derivation:
        "Positioned by the peer-and-industry-context service against the NAICS-33 cohort.",
    },
    {
      id: "collateral-value",
      label: "Collateral value",
      display: "$31M",
      raw: 31000000,
      origin: "computed",
      producer: "collateral-valuator",
      producerKind: "service",
      confidence: undefined,
      sources: [],
      derivation:
        "Valued by the collateral-valuator service from the pledged-asset schedule.",
    },

    // Layer 3 — agent reasoning over the computed values.
    {
      id: "risk-band",
      label: "Proposed risk band",
      display: "1-pass",
      raw: "1-pass",
      origin: "computed",
      producer: "rater-with-covenant",
      producerKind: "agent",
      confidence: 0.91,
      sources: ["dscr", "leverage", "peer-band", "single-borrower-exposure"],
      derivation:
        "Reasoned by the rater-with-covenant agent across DSCR, leverage, peer fit, and single-borrower exposure.",
    },
    {
      id: "memo-narrative",
      label: "Memo narrative",
      display: "Drafted (4,233 tokens)",
      origin: "computed",
      producer: "narrative-drafter",
      producerKind: "agent",
      confidence: 0.89,
      sources: ["risk-band", "free-cash-flow", "customer-concentration"],
      derivation:
        "Drafted by the narrative-drafter agent from the rating, FCF, and concentration profile.",
    },

    // Layer 4 — rule verdicts (origin: decided by rules engine).
    {
      id: "rule-dscr",
      label: "Rule: DSCR threshold",
      display: RULE_VERDICTS["dscr_threshold_by_industry"] ?? "skip",
      origin: "decided",
      producer: "dscr_threshold_by_industry",
      producerKind: "rules",
      sources: ["dscr"],
      derivation: "Evaluated by the JDM dscr_threshold_by_industry rule.",
    },
    {
      id: "rule-leverage",
      label: "Rule: leverage threshold",
      display: RULE_VERDICTS["leverage_threshold_by_industry"] ?? "skip",
      origin: "decided",
      producer: "leverage_threshold_by_industry",
      producerKind: "rules",
      sources: ["leverage"],
      derivation: "Evaluated by the JDM leverage_threshold_by_industry rule.",
    },
    {
      id: "rule-single-borrower",
      label: "Rule: single-borrower exposure",
      display: RULE_VERDICTS["single_borrower_exposure"] ?? "skip",
      origin: "decided",
      producer: "single_borrower_exposure",
      producerKind: "rules",
      sources: ["single-borrower-exposure"],
      derivation:
        "Evaluated by the JDM single_borrower_exposure rule against the bank-wide cap.",
    },
    {
      id: "rule-reg-o",
      label: "Rule: Reg O individual limit",
      display: RULE_VERDICTS["reg_o_individual_limit"] ?? "skip",
      origin: "decided",
      producer: "reg_o_individual_limit",
      producerKind: "rules",
      sources: [],
      derivation:
        "Evaluated by the JDM reg_o_individual_limit rule against officer/insider screening.",
    },

    // Layer 5 — final decision (origin: decided by human at gate).
    {
      id: "final-decision",
      label: "Final credit decision",
      display: LIVE_CASE.decision,
      origin: "decided",
      producer: "Credit Officer",
      producerKind: "human",
      sources: [
        "risk-band",
        "memo-narrative",
        "rule-dscr",
        "rule-leverage",
        "rule-single-borrower",
        "rule-reg-o",
      ],
      derivation:
        "Approved at the final_approval gate after all upstream verdicts attested.",
    },
  ];

  return nodes;
}

// ─── graph traversals ────────────────────────────────────────────────────

export interface ValueGraph {
  nodes: ValueNode[];
  byId: Record<string, ValueNode>;
  consumersOf: Record<string, string[]>;
}

export function indexGraph(nodes: ValueNode[]): ValueGraph {
  const byId: Record<string, ValueNode> = {};
  const consumersOf: Record<string, string[]> = {};
  for (const n of nodes) {
    byId[n.id] = n;
    if (!consumersOf[n.id]) consumersOf[n.id] = [];
  }
  for (const n of nodes) {
    for (const s of n.sources) {
      if (!consumersOf[s]) consumersOf[s] = [];
      consumersOf[s].push(n.id);
    }
  }
  return { nodes, byId, consumersOf };
}

/**
 * Backward chain — every transitive source of a value, ordered
 * breadth-first from the value back to its leaves.
 */
export function backwardChain(g: ValueGraph, valueId: string): ValueNode[] {
  const seen = new Set<string>();
  const out: ValueNode[] = [];
  const queue: string[] = [valueId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = g.byId[id];
    if (!node) continue;
    out.push(node);
    for (const s of node.sources) queue.push(s);
  }
  return out;
}

/**
 * Forward chain — every transitive consumer of a value, breadth-first
 * from the value out to the final decision.
 */
export function forwardChain(g: ValueGraph, valueId: string): ValueNode[] {
  const seen = new Set<string>();
  const out: ValueNode[] = [];
  const queue: string[] = [valueId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = g.byId[id];
    if (!node) continue;
    if (id !== valueId) out.push(node);
    const cons = g.consumersOf[id] ?? [];
    for (const c of cons) queue.push(c);
  }
  return out;
}

// ─── gate provenance scope ───────────────────────────────────────────────
// Each HITL gate is reframed as a TRUST ATTESTATION: the reviewer signs
// off on the provenance of a specific subtree of values. The wiring
// below names — declaratively — which value ids feed which gate.

export interface GateScope {
  id: string;
  label: string;
  /** Banker-readable one-liner of what the reviewer is attesting to */
  attestation: string;
  /** Subset of value-graph ids whose provenance this gate covers */
  valueIds: string[];
  /** Authority that signs */
  authority: string;
  /** Recommendation verb (ACCEPT / APPROVE / RETURN / DECLINE) */
  recommendation: string;
  /** Banker-readable rationale */
  rationale: string;
  /** True if the action posts to a downstream sink (e.g. GL) */
  irrevocable?: boolean;
}

export const GATE_SCOPES: Record<string, GateScope> = {
  extraction_review: {
    id: "extraction_review",
    label: "Extraction review",
    attestation:
      "I attest that the values pulled from source documents match the cited excerpts.",
    valueIds: [
      "revenue",
      "ebitda",
      "interest-expense",
      "total-debt",
      "total-equity",
      "operating-cash-flow",
      "free-cash-flow",
      "customer-concentration",
    ],
    authority: "Credit Analyst",
    recommendation: "ACCEPT",
    rationale:
      "Document extractor returned 0.93 mean confidence across 240 pages with citations attached to each extracted field. Spot-check before downstream spreading.",
  },
  rating_review: {
    id: "rating_review",
    label: "Rating review",
    attestation:
      "I attest that the proposed risk band follows from the spreading, serviceability, and peer-context outputs.",
    valueIds: [
      "dscr",
      "leverage",
      "peer-band",
      "single-borrower-exposure",
      "collateral-value",
      "risk-band",
    ],
    authority: "Underwriter",
    recommendation: "ACCEPT",
    rationale:
      "Rater-with-covenant produced a 1-pass band consistent with peer-and-industry-context and loan-serviceability outputs. Single-borrower exposure is on watch — confirm covenant package covers it.",
  },
  draft_review: {
    id: "draft_review",
    label: "Draft review",
    attestation:
      "I attest that the memo narrative cites only values whose provenance is on this page.",
    valueIds: ["memo-narrative", "risk-band", "free-cash-flow", "customer-concentration"],
    authority: "Senior Underwriter",
    recommendation: "ACCEPT",
    rationale:
      "Narrative-drafter produced the memo from the analyst-multisection chain. Memo-reviewer-v2 cleared citation density.",
  },
  final_approval: {
    id: "final_approval",
    label: "Final approval",
    attestation:
      "I attest that the full provenance subtree under this decision is correct, complete, and free of unresolved exceptions.",
    valueIds: [
      "final-decision",
      "risk-band",
      "memo-narrative",
      "rule-dscr",
      "rule-leverage",
      "rule-single-borrower",
      "rule-reg-o",
    ],
    authority: "Credit Officer",
    recommendation: "APPROVE",
    rationale:
      "All upstream gates accepted. Rule verdicts: 3 pass, 1 watch (single-borrower). Final signoff posts the loan to GL.",
    irrevocable: true,
  },
};

export interface GateState {
  id: string;
  label: string;
  status: "completed" | "pending" | "queued";
  decision?: string;
  decidedAt?: string;
}

export function gateStates(
  events: readonly RawEvt[],
  hitlGates: readonly string[],
): GateState[] {
  return hitlGates.map((g) => {
    const completedEvt = events.find(
      (e) => e.kind === "human_action" && e.gate === g,
    );
    if (completedEvt) {
      return {
        id: g,
        label: GATE_SCOPES[g]?.label ?? g,
        status: "completed" as const,
        decision: completedEvt.decision,
        decidedAt: completedEvt.at,
      };
    }
    const pendingEvt = events.find(
      (e) => e.kind === "human_action_pending" && e.gate === g,
    );
    if (pendingEvt) {
      return {
        id: g,
        label: GATE_SCOPES[g]?.label ?? g,
        status: "pending" as const,
      };
    }
    return {
      id: g,
      label: GATE_SCOPES[g]?.label ?? g,
      status: "queued" as const,
    };
  });
}

// ─── filter / view modes ─────────────────────────────────────────────────

export type GraphFilter =
  | "all"
  | "extracted"
  | "computed"
  | "decided"
  | "low-confidence";

export function filterGraph(
  nodes: readonly ValueNode[],
  filter: GraphFilter,
): ValueNode[] {
  if (filter === "all") return [...nodes];
  if (filter === "low-confidence") {
    return nodes.filter(
      (n) => typeof n.confidence === "number" && n.confidence < 0.92,
    );
  }
  return nodes.filter((n) => n.origin === filter);
}

// ─── summary counts (no math beyond counting) ────────────────────────────

export interface GraphSummary {
  totalNodes: number;
  extractedCount: number;
  computedCount: number;
  decidedCount: number;
  lowConfidenceCount: number;
  meanExtractedConfidence: number;
}

export function summarise(nodes: readonly ValueNode[]): GraphSummary {
  let extracted = 0;
  let computed = 0;
  let decided = 0;
  let low = 0;
  let confSum = 0;
  let confCount = 0;
  for (const n of nodes) {
    if (n.origin === "extracted") extracted += 1;
    if (n.origin === "computed") computed += 1;
    if (n.origin === "decided") decided += 1;
    if (typeof n.confidence === "number") {
      if (n.confidence < 0.92) low += 1;
      if (n.origin === "extracted") {
        confSum += n.confidence;
        confCount += 1;
      }
    }
  }
  return {
    totalNodes: nodes.length,
    extractedCount: extracted,
    computedCount: computed,
    decidedCount: decided,
    lowConfidenceCount: low,
    meanExtractedConfidence:
      confCount === 0 ? 0 : Math.round((confSum / confCount) * 1000) / 1000,
  };
}
