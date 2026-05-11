// Re-export adapters from the SHARED mock-data contract.
// This file is the ONLY place option-a touches the mock-data import path,
// so if the contract moves, only this file changes.

import {
  LIVE_CASE,
  CASE_SHAPE,
  PRIMARY_BORROWER,
  HITL_GATES,
  PIPELINE_EVENTS,
  RULE_VERDICTS,
  SHARED_RULES,
  ATOMIC_SERVICE_STUBS,
  AGENT_OUTPUT_STUBS,
  MODEL_PROVIDER,
  USE_CASE_ID,
} from "../../_shared/mock-data";

export {
  LIVE_CASE,
  CASE_SHAPE,
  PRIMARY_BORROWER,
  HITL_GATES,
  PIPELINE_EVENTS,
  RULE_VERDICTS,
  SHARED_RULES,
  ATOMIC_SERVICE_STUBS,
  AGENT_OUTPUT_STUBS,
  MODEL_PROVIDER,
  USE_CASE_ID,
};

// Adapter: extracted financials block — typed for the UI rather than `unknown`.
// We DO NOT compute anything; we just read what the spreader/extractor put
// in the mock contract and surface it. No business logic.
interface ExtractedFields {
  income_statement: {
    revenue: number;
    ebitda: number;
    operating_income: number;
    interest_expense: number;
    net_income: number;
  };
  balance_sheet: {
    total_assets: number;
    total_debt: number;
    total_equity: number;
  };
  cash_flow: {
    operating_cash_flow: number;
    free_cash_flow: number;
  };
}

interface DocumentExtractorStub {
  extracted_fields: ExtractedFields;
  confidence: number;
  page_count: number;
  citations: Array<{
    field_path: string;
    page: number;
    excerpt: string;
    confidence: number;
  }>;
}

export function getExtractedFinancials(): DocumentExtractorStub {
  return ATOMIC_SERVICE_STUBS["document-extractor"] as DocumentExtractorStub;
}

// Adapter: per-gate status derived ONLY from the events list. No decisions made
// in code — we read kind/decision verbatim.
export interface GateStatus {
  gate: string;
  state: "pending" | "decided" | "waiting";
  decision?: string;
  decidedAt?: string;
}

export function getGateStatuses(): GateStatus[] {
  const map = new Map<string, GateStatus>();
  for (const gate of HITL_GATES) {
    map.set(gate, { gate, state: "waiting" });
  }
  for (const e of PIPELINE_EVENTS) {
    const evt = e as Record<string, string | undefined>;
    if (evt.kind === "human_action_pending" && evt.gate) {
      map.set(evt.gate, { gate: evt.gate, state: "pending" });
    }
    if (evt.kind === "human_action" && evt.gate) {
      map.set(evt.gate, {
        gate: evt.gate,
        state: "decided",
        decision: evt.decision,
        decidedAt: evt.at,
      });
    }
  }
  return HITL_GATES.map((g) => map.get(g)!);
}

// Adapter: the "decision card" payload. Everything the executive needs in 30s.
// Read straight from mock-data — no math, no thresholds.
export interface DecisionCard {
  caseId: string;
  title: string;
  borrowerName: string;
  riskBand: string;
  decision: string;
  decisionKind: string;
  currentStage: string;
  modelProvider: string;
  pageCount: number;
  extractionConfidence: number;
}

export function getDecisionCard(): DecisionCard {
  const extr = getExtractedFinancials();
  // `noUncheckedIndexedAccess` makes `LIVE_CASE.borrower` and
  // `LIVE_CASE.current_stage` possibly undefined (because they are sourced
  // from `BORROWERS[0]` and `CASE_SHAPE.stages[len-1]`). The mock contract
  // guarantees they exist; we surface a stable string fallback rather than
  // crash on a phantom undefined.
  const borrowerName = LIVE_CASE.borrower?.name ?? "—";
  const riskBand = LIVE_CASE.borrower?.risk_band ?? "—";
  const currentStage = LIVE_CASE.current_stage ?? "—";
  return {
    caseId: LIVE_CASE.id,
    title: LIVE_CASE.title,
    borrowerName,
    riskBand,
    decision: LIVE_CASE.decision,
    decisionKind: LIVE_CASE.decision_kind,
    currentStage,
    modelProvider: MODEL_PROVIDER,
    pageCount: extr.page_count,
    extractionConfidence: extr.confidence,
  };
}

// Map rule verdicts (strings) → StatusBadge kinds. Pure presentation mapping;
// the verdict value itself is read verbatim from RULE_VERDICTS.
export function ruleVerdictBadgeKind(
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
}
