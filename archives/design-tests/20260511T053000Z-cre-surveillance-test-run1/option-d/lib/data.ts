// Option D — wildcard "regulator-audit-first" view for CRE surveillance.
//
// Data layer is read-only: every export below either re-exports a value
// from the single source of truth at `_shared/mock-data.ts` OR shapes a
// pure citation chain from it. NO business logic, NO threshold math —
// the auditor (Cloud Workflows + GoRules) owns that. This module
// presents only what the auditor declared.

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

// ─────────────────────────────────────────────────────────────────────
// Regulator-audit-first concepts.
//
// In an OCC examiner's view, every observation traces back to:
//   1. a CITATION (the statute / interagency guidance / policy section)
//   2. a THRESHOLD (the bank's policy parameter, with effective date)
//   3. a TRIGGER (the system-of-record event that breached or watched)
//   4. a DISPOSITION (the human decision: watch / escalate / reserve)
//
// The page IS that ledger.
// ─────────────────────────────────────────────────────────────────────

export interface Citation {
  /** Short code, e.g. "12 CFR 365.2" or "BANK-CRE-POL-2024-03 §4.2". */
  id: string;
  /** Human-readable label. */
  title: string;
  /** Source authority — regulator | bank | interagency. */
  authority: "OCC" | "FRB" | "FDIC" | "Interagency" | "Bank policy" | "Loan agreement";
  /** Optional URL to the source document. Banker-readable text in lieu. */
  href?: string;
}

export interface ThresholdRow {
  id: string;
  /** Banker-readable label */
  label: string;
  /** Threshold value as a string, formatted at source */
  value: string;
  /** Effective-from date — versioned policy. */
  effectiveDate: string;
  /** Status — pass | watch | breach | skip. */
  verdict: "pass" | "watch" | "fail" | "skip";
  /** Observed value at evaluation time, banker-readable. */
  observed: string;
  /** Citations that authorize this threshold. */
  citations: Citation[];
}

/**
 * Citation catalog used by this option's regulator-audit-first surface.
 * Each citation links a bank policy or regulatory statute to a threshold
 * the GoRules engine evaluates. The strings here are display-only — the
 * real authority is the canvas (CANVAS_SHA256) and the rules-service.
 */
const CITATIONS: Record<string, Citation> = {
  occ_concentration: {
    id: "OCC Bulletin 2006-46",
    title: "Concentrations in Commercial Real Estate Lending",
    authority: "OCC",
  },
  occ_alll_credit: {
    id: "OCC Bulletin 2020-49",
    title: "Allowances for Credit Losses (CECL) Methodology",
    authority: "OCC",
  },
  cfr_real_estate: {
    id: "12 CFR 34 Subpart D",
    title: "Real Estate Lending and Appraisals",
    authority: "OCC",
  },
  interagency_cre: {
    id: "Interagency Guidance 2006",
    title: "CRE Concentration Risk Management",
    authority: "Interagency",
  },
  bank_cre_policy: {
    id: "BANK-CRE-POL-2026 §4.2",
    title: "Northeast region cap-rate band policy",
    authority: "Bank policy",
  },
  bank_dscr_policy: {
    id: "BANK-CRE-POL-2026 §6.1",
    title: "DSCR floor by property type",
    authority: "Bank policy",
  },
  loan_covenant: {
    id: "Loan Agreement §7(b)",
    title: "Borrower DSCR maintenance covenant",
    authority: "Loan agreement",
  },
};

/**
 * Map each shared rule (from SHARED_RULES) to its citation chain and
 * the banker-readable threshold language. Values come from canvas /
 * rules engine; this module only relabels for the examiner's view.
 */
const THRESHOLD_BLUEPRINTS: Record<string, Omit<ThresholdRow, "verdict">> = {
  cap_rate_band_check: {
    id: "cap_rate_band_check",
    label: "Cap-rate band (Northeast, multifamily)",
    value: "4.75% – 6.50%",
    effectiveDate: "2026-01-01",
    observed: "5.32%",
    citations: [
      CITATIONS.bank_cre_policy,
      CITATIONS.interagency_cre,
    ],
  },
  dscr_threshold: {
    id: "dscr_threshold",
    label: "Debt-Service Coverage Ratio (multifamily floor)",
    value: "≥ 1.20×",
    effectiveDate: "2026-01-01",
    observed: "1.34×",
    citations: [
      CITATIONS.bank_dscr_policy,
      CITATIONS.loan_covenant,
      CITATIONS.cfr_real_estate,
    ],
  },
};

export function thresholdRows(): ThresholdRow[] {
  return SHARED_RULES.map((rule) => {
    const blueprint = THRESHOLD_BLUEPRINTS[rule];
    const verdict = RULE_VERDICTS[rule] ?? "skip";
    if (blueprint) {
      return { ...blueprint, verdict };
    }
    return {
      id: rule,
      label: rule.replace(/_/g, " "),
      value: "—",
      effectiveDate: "—",
      observed: "—",
      verdict,
      citations: [],
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Audit ledger — one row per material event, in order. Each row carries
// the citation chain that explains WHY the system did what it did.
// Pure shape transform from PIPELINE_EVENTS — no events invented.
// ─────────────────────────────────────────────────────────────────────

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

export type LedgerKind =
  | "intake"
  | "extraction"
  | "service_call"
  | "agent_reasoning"
  | "rule_evaluation"
  | "watchlist_event"
  | "hitl_pending"
  | "hitl_decided"
  | "stage_transition";

export interface LedgerRow {
  /** Stable key — index in PIPELINE_EVENTS. */
  idx: number;
  at: string;
  kind: LedgerKind;
  /** Plain-English headline an examiner can read. */
  headline: string;
  /** Optional one-line context. */
  detail?: string;
  /** Citation chain explaining the legal/policy basis. */
  citations: Citation[];
  /** Optional artifact reference — what to drill into. */
  artifact?: string;
  /** Optional gate id if this row pertains to a HITL gate. */
  gate?: string;
  /** Optional human decision verb. */
  decision?: string;
}

const SERVICE_CITATIONS: Record<string, Citation[]> = {
  "industry-risk-scorer": [CITATIONS.interagency_cre, CITATIONS.occ_concentration],
  "peer-and-industry-context": [CITATIONS.interagency_cre],
  "exposure-aggregator": [CITATIONS.occ_concentration, CITATIONS.cfr_real_estate],
};

const GATE_CITATIONS: Record<string, Citation[]> = {
  escalate_to_watchlist: [CITATIONS.occ_concentration, CITATIONS.bank_cre_policy],
  book_specific_reserve: [CITATIONS.occ_alll_credit, CITATIONS.cfr_real_estate],
};

const GATE_LABEL: Record<string, string> = {
  escalate_to_watchlist: "Watchlist escalation",
  book_specific_reserve: "Specific reserve booking",
};

export function toLedger(events: readonly RawEvt[]): LedgerRow[] {
  return events.map((e, idx) => {
    const base = { idx, at: e.at, citations: [] as Citation[] };
    switch (e.kind) {
      case "stage_entered":
        return {
          ...base,
          kind: "stage_transition" as const,
          headline: `Stage transition → "${e.stage}"`,
          detail: "Workflow advanced to the next regulatory stage.",
        };
      case "document_uploaded":
        return {
          ...base,
          kind: "intake" as const,
          headline: `Submitted document: ${e.doc_type}`,
          detail: "Filed by reviewer for examination.",
          citations: [CITATIONS.cfr_real_estate],
          artifact: e.doc_type,
        };
      case "document_extracted":
        return {
          ...base,
          kind: "extraction" as const,
          headline: `Extracted ${e.doc_type} (confidence ${(e.confidence ?? 0).toFixed(2)})`,
          detail: "Citations attached to every extracted field; spot-check on file.",
          citations: [CITATIONS.cfr_real_estate],
          artifact: e.doc_type,
        };
      case "service_invoked":
        return {
          ...base,
          kind: "service_call" as const,
          headline: `Service: ${e.service}`,
          detail: e.latency_ms != null ? `Latency ${e.latency_ms} ms.` : undefined,
          citations: SERVICE_CITATIONS[e.service ?? ""] ?? [],
          artifact: e.service,
        };
      case "agent_invoked":
        return {
          ...base,
          kind: "agent_reasoning" as const,
          headline: `Agent reasoned: ${e.agent}`,
          detail:
            e.tokens_in != null
              ? `Tokens in ${e.tokens_in}, tokens out ${e.tokens_out}. Verbatim trace on file.`
              : "Verbatim trace on file.",
          citations: [CITATIONS.interagency_cre],
          artifact: e.agent,
        };
      case "human_action_pending":
        return {
          ...base,
          kind: "hitl_pending" as const,
          headline: `${GATE_LABEL[e.gate ?? ""] ?? e.gate}: awaiting disposition`,
          detail: "Reviewer disposition required before workflow may advance.",
          citations: GATE_CITATIONS[e.gate ?? ""] ?? [],
          gate: e.gate,
        };
      case "human_action":
        return {
          ...base,
          kind: "hitl_decided" as const,
          headline: `${GATE_LABEL[e.gate ?? ""] ?? e.gate}: ${e.decision}`,
          detail: "Disposition recorded to audit trail.",
          citations: GATE_CITATIONS[e.gate ?? ""] ?? [],
          gate: e.gate,
          decision: e.decision,
        };
      default:
        return {
          ...base,
          kind: "stage_transition" as const,
          headline: e.kind,
        };
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// Case lookup — the mock data ships one live case; any id resolves to
// it. The param is preserved verbatim so the URL stays meaningful.
// ─────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────
// HITL gate state derived from events (pure read).
// ─────────────────────────────────────────────────────────────────────

export interface GateState {
  id: string;
  label: string;
  irrevocable: boolean;
  status: "completed" | "pending" | "queued";
  decision?: string;
  decidedAt?: string;
  pendingIdx?: number;
  citations: Citation[];
}

export function gateStates(
  events: readonly RawEvt[],
  hitlGates: readonly string[],
): GateState[] {
  return hitlGates.map((g) => {
    const pendingEvt = events.find(
      (e) => e.kind === "human_action_pending" && e.gate === g,
    );
    const completedEvt = events.find(
      (e) => e.kind === "human_action" && e.gate === g,
    );
    const pendingIdx = pendingEvt ? events.indexOf(pendingEvt) : undefined;
    const irrevocable = g === "book_specific_reserve";
    const base = {
      id: g,
      label: GATE_LABEL[g] ?? g,
      irrevocable,
      citations: GATE_CITATIONS[g] ?? [],
    };
    if (completedEvt) {
      return {
        ...base,
        status: "completed" as const,
        decision: completedEvt.decision,
        decidedAt: completedEvt.at,
        pendingIdx,
      };
    }
    if (pendingEvt) {
      return { ...base, status: "pending" as const, pendingIdx };
    }
    return { ...base, status: "queued" as const };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Audit summary counters (display only).
// ─────────────────────────────────────────────────────────────────────

export interface AuditSummary {
  totalEntries: number;
  agentCalls: number;
  serviceCalls: number;
  gatesDecided: number;
  gatesTotal: number;
  thresholdsEvaluated: number;
  thresholdsBreached: number;
  documentsExtracted: number;
  citationsCovered: number;
}

export function summarize(c: CaseRecord): AuditSummary {
  let agentCalls = 0;
  let serviceCalls = 0;
  let gatesDecided = 0;
  let documentsExtracted = 0;
  for (const e of c.events) {
    if (e.kind === "agent_invoked") agentCalls += 1;
    if (e.kind === "service_invoked") serviceCalls += 1;
    if (e.kind === "human_action") gatesDecided += 1;
    if (e.kind === "document_extracted") documentsExtracted += 1;
  }
  const verdicts = Object.values(c.rule_verdicts);
  const thresholdsBreached = verdicts.filter((v) => v === "fail" || v === "watch").length;
  // citationsCovered: count unique citation ids referenced by the ledger.
  const ledger = toLedger(c.events);
  const seen = new Set<string>();
  for (const row of ledger) for (const cit of row.citations) seen.add(cit.id);
  for (const t of thresholdRows()) for (const cit of t.citations) seen.add(cit.id);
  return {
    totalEntries: c.events.length,
    agentCalls,
    serviceCalls,
    gatesDecided,
    gatesTotal: c.hitl_gates.length,
    thresholdsEvaluated: verdicts.length,
    thresholdsBreached,
    documentsExtracted,
    citationsCovered: seen.size,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Verdict → badge tone helper. Pure mapping.
// ─────────────────────────────────────────────────────────────────────

export function verdictBadge(
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
}

export function ledgerKindLabel(k: LedgerKind): string {
  switch (k) {
    case "intake":
      return "Intake";
    case "extraction":
      return "Extraction";
    case "service_call":
      return "Service";
    case "agent_reasoning":
      return "Agent";
    case "rule_evaluation":
      return "Rule";
    case "watchlist_event":
      return "Watchlist";
    case "hitl_pending":
      return "HITL pending";
    case "hitl_decided":
      return "HITL decided";
    case "stage_transition":
      return "Stage";
    default:
      return k;
  }
}
