// Option C — read-only re-export adapter over _shared/mock-data.ts.
// Designers MUST NOT redefine or modify the canvas data.
// All section-level decisions ("inline action") map back to the
// canvas HITL gates (extraction_review, rating_review, draft_review,
// final_approval). No business logic here — just plain projections.

import {
  USE_CASE_ID,
  CANVAS_SHA256,
  CONSOLE_PATTERN,
  PRIMARY_BORROWER,
  CASE_SHAPE,
  HITL_GATES,
  ATOMIC_SERVICE_STUBS,
  AGENT_OUTPUT_STUBS,
  SHARED_RULES,
  RULE_VERDICTS,
  PIPELINE_EVENTS,
  LIVE_CASE,
  MODEL_PROVIDER,
  COMPLIANCE_SCOPE,
  type Borrower,
  type CaseShape,
} from "../../_shared/mock-data";

export {
  USE_CASE_ID,
  CANVAS_SHA256,
  CONSOLE_PATTERN,
  PRIMARY_BORROWER,
  CASE_SHAPE,
  HITL_GATES,
  ATOMIC_SERVICE_STUBS,
  AGENT_OUTPUT_STUBS,
  SHARED_RULES,
  RULE_VERDICTS,
  PIPELINE_EVENTS,
  LIVE_CASE,
  MODEL_PROVIDER,
  COMPLIANCE_SCOPE,
};
export type { Borrower, CaseShape };

// ────────────────────────────────────────────────────────────────────────
// Section model — the memo is a list of sections. Each section maps
// to a HITL gate and gets its own inline action surface. Sections are
// the unit of analyst review.
// ────────────────────────────────────────────────────────────────────────

export type SectionKind =
  | "extraction"
  | "spread"
  | "peer"
  | "collateral"
  | "borrower-network"
  | "rating"
  | "rules"
  | "draft"
  | "final";

export type GateId =
  | "extraction_review"
  | "rating_review"
  | "draft_review"
  | "final_approval";

export interface MemoSection {
  id: SectionKind;
  /** Banker-facing label */
  title: string;
  /** Short prompt rendered under the title; explains what the analyst is judging here. */
  prompt: string;
  /** Which canvas HITL gate this section's inline decision satisfies. */
  gate: GateId;
  /** Source agent / service that produced the content. */
  source: string;
  /** Model confidence 0..1 if applicable. */
  confidence?: number;
  /** Optional risk-band tone driver. */
  tone?: "ok" | "warning" | "danger";
  /** Already-decided disposition (for the fast-track approval page). */
  preDecided?: SectionDecision;
}

export type SectionDecisionKind =
  | "pending"
  | "approve"
  | "edit"
  | "reject"
  | "request-revision";

export interface SectionDecision {
  kind: SectionDecisionKind;
  /** Required for edit / reject / request-revision */
  comment?: string;
}

// Map canvas service / agent / rule stubs into sections — no business
// logic, just renderable rows.
export interface ServiceRow {
  id: string;
  label: string;
  status: "ran" | "stub" | "skipped";
}

export const serviceRows = (): ServiceRow[] =>
  Object.keys(ATOMIC_SERVICE_STUBS).map((id) => ({
    id,
    label: id.replace(/-/g, " "),
    status:
      // canvas mock marks _stub:true on placeholders; document-extractor
      // is the only one with real extracted_fields.
      typeof (ATOMIC_SERVICE_STUBS[id] as { _stub?: string })._stub ===
      "string"
        ? "stub"
        : "ran",
  }));

export interface AgentRow {
  id: string;
  label: string;
}

export const agentRows = (): AgentRow[] =>
  Object.keys(AGENT_OUTPUT_STUBS).map((id) => ({
    id,
    label: id.replace(/-/g, " "),
  }));

export interface RuleRow {
  id: string;
  verdict: "pass" | "watch" | "fail" | "skip";
}

export const ruleRows = (): RuleRow[] =>
  SHARED_RULES.map((id) => ({
    id,
    verdict: RULE_VERDICTS[id] ?? "skip",
  }));

// Static section definitions for option C's case-detail page.
// These are NOT business rules — they are the read-only spec of which
// HITL gate each memo section maps to. The mapping was set by the canvas.
export const SECTIONS: MemoSection[] = [
  {
    id: "extraction",
    title: "Document extraction",
    prompt:
      "10-K parsed. Confirm the spread inputs match what the borrower filed.",
    gate: "extraction_review",
    source: "document-extractor",
    confidence: 0.93,
    tone: "ok",
  },
  {
    id: "spread",
    title: "Financial spread",
    prompt:
      "Revenue, EBITDA, leverage, DSCR — produced by financial-spreader.",
    gate: "extraction_review",
    source: "financial-spreader",
    tone: "ok",
  },
  {
    id: "peer",
    title: "Peer & industry context",
    prompt: "Where does the borrower sit against peers in the same NAICS.",
    gate: "rating_review",
    source: "peer-and-industry-context",
    tone: "ok",
  },
  {
    id: "collateral",
    title: "Collateral",
    prompt: "Coverage and lien status from collateral-valuator.",
    gate: "rating_review",
    source: "collateral-valuator",
    tone: "ok",
  },
  {
    id: "borrower-network",
    title: "Borrower network",
    prompt: "Related-party exposure, Reg O and single-borrower limit checks.",
    gate: "rating_review",
    source: "borrower-network",
    tone: "warning",
  },
  {
    id: "rating",
    title: "Risk rating",
    prompt:
      "Internal rating produced by rater-with-covenant. Inline override if you disagree.",
    gate: "rating_review",
    source: "rater-with-covenant",
    confidence: 0.88,
    tone: "ok",
  },
  {
    id: "rules",
    title: "Policy rules",
    prompt: "Shared JDM rule outcomes. Watch / fail verdicts require comment.",
    gate: "rating_review",
    source: "rules-service",
    tone: "warning",
  },
  {
    id: "draft",
    title: "Memo narrative draft",
    prompt:
      "Auto-drafted by narrative-drafter; reviewed by memo-reviewer-v2.",
    gate: "draft_review",
    source: "narrative-drafter",
    confidence: 0.91,
    tone: "ok",
  },
  {
    id: "final",
    title: "Final approval",
    prompt:
      "Approval matrix — sign-off authority required for the recommended decision.",
    gate: "final_approval",
    source: "approval_matrix_commercial",
    tone: "ok",
  },
];

// Stage labels for the WorkflowStageRail. Read straight from the canvas.
export const stageLabels = (): { id: string; label: string }[] =>
  CASE_SHAPE.stages.map((s) => ({ id: s, label: s }));

// Headline metrics derived from the extracted document. NO calculation —
// these numbers come straight from the canvas extracted_fields and we
// surface them verbatim.
interface ExtractedShape {
  extracted_fields?: {
    income_statement?: {
      revenue?: number;
      ebitda?: number;
      interest_expense?: number;
    };
    balance_sheet?: {
      total_debt?: number;
      total_equity?: number;
    };
  };
  confidence?: number;
  page_count?: number;
}

export const extractedHeadline = () => {
  const e = ATOMIC_SERVICE_STUBS["document-extractor"] as ExtractedShape;
  return {
    revenue: e.extracted_fields?.income_statement?.revenue ?? null,
    ebitda: e.extracted_fields?.income_statement?.ebitda ?? null,
    interest: e.extracted_fields?.income_statement?.interest_expense ?? null,
    debt: e.extracted_fields?.balance_sheet?.total_debt ?? null,
    equity: e.extracted_fields?.balance_sheet?.total_equity ?? null,
    confidence: e.confidence ?? null,
    pages: e.page_count ?? null,
  };
};

// Map a gate to the sections that share it (used by the approval page).
export const sectionsForGate = (gate: GateId): MemoSection[] =>
  SECTIONS.filter((s) => s.gate === gate);
