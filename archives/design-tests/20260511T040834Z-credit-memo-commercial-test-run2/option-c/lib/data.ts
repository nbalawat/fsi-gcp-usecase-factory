// Option C — "inline-per-section affordance" view.
//
// Data layer is read-only: every export below re-exports values from the
// single source of truth at `_shared/mock-data.ts`. No new values are
// computed here. Adapters BELOW the re-export bar are pure shape
// transforms (event → section evidence row, gate → section state) — no
// business logic, no math, no decisions.

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

// Strict event shape — no `any` leaks past this boundary.
export interface RawEvt {
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

// ─── case lookup ─────────────────────────────────────────────────────────

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

/**
 * Look up a case by canonical id. Mock data ships a single live case;
 * any id resolves to it (the param is preserved verbatim so the URL
 * stays meaningful and the section panels show the right borrower).
 */
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

// ─── section model (the spine of option-C) ──────────────────────────────
//
// The memo is read as five SECTIONS. Each section is the unit of human
// disposition — the affordance row lives at the bottom of that section.
//
//   1. borrower       — borrower identity, uploaded documents, intake
//   2. extraction     — document-extractor + extraction_review gate
//   3. spread+rating  — atomic services + rater agent + rating_review gate
//   4. draft          — narrative-drafter + reviewer + draft_review gate
//   5. final          — rule verdicts + final_approval gate
//
// Order is fixed (matches the workflow). Each section carries an
// EVIDENCE list (the rows of activity behind it) plus a GATE id that
// names the HITL it ends in. Sections without a HITL gate (the borrower
// intake row) carry gate=null.

export type SectionId =
  | "borrower"
  | "extraction"
  | "spread_and_rating"
  | "draft"
  | "final";

export type EvidenceKind =
  | "stage"        // pipeline stage transition
  | "upload"       // human uploaded a document
  | "extract"      // document-extractor produced fields
  | "service"      // atomic service invocation
  | "agent"        // ADK agent reasoning
  | "rule"         // rules-engine verdict
  | "decision";    // a prior human decision on a gate

export interface EvidenceRow {
  /** Stable index — used as React key. */
  idx: number;
  at: string;
  kind: EvidenceKind;
  /** Banker-readable speaker. */
  speaker: string;
  /** What happened, in 6-12 words. */
  headline: string;
  /** Optional one-line detail (e.g. "240 pages, 0.93 confidence"). */
  detail?: string;
  /** Optional drill-in id (agent / service / rule). */
  ref?: string;
  /** Optional numeric meta — latency, tokens, confidence. */
  meta?: { latencyMs?: number; tokensIn?: number; tokensOut?: number; confidence?: number };
}

export type SectionStatus = "completed" | "pending" | "queued";

export interface SectionState {
  id: SectionId;
  title: string;
  /** Banker-vocabulary one-liner. */
  blurb: string;
  /** HITL gate this section ends in. null if no gate (e.g. borrower intake). */
  gate: string | null;
  status: SectionStatus;
  decision?: string;
  decidedAt?: string;
  evidence: EvidenceRow[];
}

const SECTION_TITLES: Record<SectionId, { title: string; blurb: string }> = {
  borrower: {
    title: "Borrower & documents",
    blurb: "Who is borrowing and what they uploaded to support it.",
  },
  extraction: {
    title: "Document extraction",
    blurb: "Fields the extractor pulled from the uploads, with confidence.",
  },
  spread_and_rating: {
    title: "Financial spread & rating",
    blurb: "Atomic services + the rater-with-covenant agent produced the band.",
  },
  draft: {
    title: "Memo draft",
    blurb: "Narrative drafter wrote the memo; reviewer checked citations.",
  },
  final: {
    title: "Final approval",
    blurb: "Rule verdicts plus a credit-officer signoff that posts the loan.",
  },
};

// Section → HITL gate mapping (fixed by the canvas).
const SECTION_GATE: Record<SectionId, string | null> = {
  borrower: null,
  extraction: "extraction_review",
  spread_and_rating: "rating_review",
  draft: "draft_review",
  final: "final_approval",
};

// Banker labels for the rules.
const RULE_LABEL: Record<string, string> = {
  dscr_threshold_by_industry: "DSCR threshold by industry",
  leverage_threshold_by_industry: "Leverage threshold by industry",
  single_borrower_exposure: "Single-borrower exposure",
  reg_o_individual_limit: "Reg O individual limit",
};

const HITL_LABEL: Record<string, string> = {
  extraction_review: "Extraction review",
  rating_review: "Rating review",
  draft_review: "Draft review",
  final_approval: "Final approval",
};

/**
 * Partition the event log into per-section evidence rows. Pure shape
 * transform — no decisions, no math, no thresholds.
 *
 * Section boundaries follow the workflow:
 *   borrower          ← stage_entered intake, document_uploaded
 *   extraction        ← stage_entered extracting, document_extracted
 *   spread_and_rating ← service_invoked, agent_invoked (analyst, rater)
 *   draft             ← agent_invoked narrative-drafter, memo-reviewer-v2
 *   final             ← (rule verdicts come from RULE_VERDICTS map; the
 *                        stage_entered "done" row goes here)
 *
 * Gate-pending and gate-decision rows are NOT folded into a section's
 * evidence list — they live on the section's `status` / `decision` /
 * `decidedAt` instead.
 */
export function partitionSections(
  c: CaseRecord,
  ruleVerdicts: Record<string, "pass" | "watch" | "fail" | "skip">,
): SectionState[] {
  const evidence: Record<SectionId, EvidenceRow[]> = {
    borrower: [],
    extraction: [],
    spread_and_rating: [],
    draft: [],
    final: [],
  };

  c.events.forEach((e, idx) => {
    const base = { idx, at: e.at };
    switch (e.kind) {
      case "stage_entered":
        if (e.stage === "intake") {
          evidence.borrower.push({
            ...base,
            kind: "stage",
            speaker: "pipeline",
            headline: 'Entered stage "intake"',
          });
        } else if (e.stage === "extracting") {
          evidence.extraction.push({
            ...base,
            kind: "stage",
            speaker: "pipeline",
            headline: 'Entered stage "extracting"',
          });
        } else if (e.stage === "done") {
          evidence.final.push({
            ...base,
            kind: "stage",
            speaker: "pipeline",
            headline: 'Entered stage "done"',
          });
        }
        return;
      case "document_uploaded":
        evidence.borrower.push({
          ...base,
          kind: "upload",
          speaker: CASE_SHAPE.primary_actor,
          headline: `Uploaded ${e.doc_type ?? "document"}`,
        });
        return;
      case "document_extracted":
        evidence.extraction.push({
          ...base,
          kind: "extract",
          speaker: "document-extractor",
          headline: `Extracted ${e.doc_type ?? "document"}`,
          ref: "document-extractor",
          meta: { confidence: e.confidence },
        });
        return;
      case "service_invoked": {
        const svc = e.service ?? "service";
        // document-extractor service belongs with extraction section;
        // every other atomic service is part of the spread+rating
        // section.
        if (svc === "document-extractor") {
          evidence.extraction.push({
            ...base,
            kind: "service",
            speaker: svc,
            headline: `Ran ${svc}`,
            ref: svc,
            meta: { latencyMs: e.latency_ms },
          });
        } else {
          evidence.spread_and_rating.push({
            ...base,
            kind: "service",
            speaker: svc,
            headline: `Ran ${svc}`,
            ref: svc,
            meta: { latencyMs: e.latency_ms },
          });
        }
        return;
      }
      case "agent_invoked": {
        const ag = e.agent ?? "agent";
        if (ag === "document-processor") {
          evidence.extraction.push({
            ...base,
            kind: "agent",
            speaker: ag,
            headline: `${ag} reasoned over uploads`,
            ref: ag,
            meta: { tokensIn: e.tokens_in, tokensOut: e.tokens_out },
          });
        } else if (ag === "narrative-drafter" || ag === "memo-reviewer-v2") {
          evidence.draft.push({
            ...base,
            kind: "agent",
            speaker: ag,
            headline: `${ag} reasoned`,
            ref: ag,
            meta: { tokensIn: e.tokens_in, tokensOut: e.tokens_out },
          });
        } else {
          evidence.spread_and_rating.push({
            ...base,
            kind: "agent",
            speaker: ag,
            headline: `${ag} reasoned`,
            ref: ag,
            meta: { tokensIn: e.tokens_in, tokensOut: e.tokens_out },
          });
        }
        return;
      }
      default:
        return; // human_action / human_action_pending handled below
    }
  });

  // Rule verdicts are not events — they are settled state. Surface them
  // in the final section as evidence rows so the user sees what they
  // are about to sign off on. Order is the canvas's rule order.
  SHARED_RULES.forEach((r, i) => {
    const v = ruleVerdicts[r] ?? "skip";
    evidence.final.push({
      idx: 1000 + i,
      at: c.events[c.events.length - 1]?.at ?? "",
      kind: "rule",
      speaker: "rules-engine",
      headline: `${RULE_LABEL[r] ?? r} → ${v}`,
      ref: r,
    });
  });

  // Section status / decision come from the gate's human_action / pending events.
  const ids: SectionId[] = ["borrower", "extraction", "spread_and_rating", "draft", "final"];
  return ids.map((id) => {
    const gate = SECTION_GATE[id];
    let status: SectionStatus = "completed"; // borrower has no gate; treat as auto-completed when uploads exist
    let decision: string | undefined;
    let decidedAt: string | undefined;
    if (gate) {
      const completedEvt = c.events.find(
        (e) => e.kind === "human_action" && e.gate === gate,
      );
      const pendingEvt = c.events.find(
        (e) => e.kind === "human_action_pending" && e.gate === gate,
      );
      if (completedEvt) {
        status = "completed";
        decision = completedEvt.decision;
        decidedAt = completedEvt.at;
      } else if (pendingEvt) {
        status = "pending";
      } else {
        status = "queued";
      }
    } else {
      status = evidence[id].length > 0 ? "completed" : "queued";
    }
    return {
      id,
      title: SECTION_TITLES[id].title,
      blurb: SECTION_TITLES[id].blurb,
      gate,
      status,
      decision,
      decidedAt,
      evidence: evidence[id],
    };
  });
}

// ─── HITL gate state (used by approval page header / nav) ───────────────

export interface GateState {
  id: string;
  label: string;
  status: SectionStatus;
  decision?: string;
  decidedAt?: string;
  /** The section this gate ends — used to jump back to it on case page. */
  sectionId: SectionId;
}

const GATE_SECTION: Record<string, SectionId> = {
  extraction_review: "extraction",
  rating_review: "spread_and_rating",
  draft_review: "draft",
  final_approval: "final",
};

export function gateStates(
  events: readonly RawEvt[],
  hitlGates: readonly string[],
): GateState[] {
  return hitlGates.map((g) => {
    const completedEvt = events.find(
      (e) => e.kind === "human_action" && e.gate === g,
    );
    const pendingEvt = events.find(
      (e) => e.kind === "human_action_pending" && e.gate === g,
    );
    if (completedEvt) {
      return {
        id: g,
        label: HITL_LABEL[g] ?? g,
        status: "completed",
        decision: completedEvt.decision,
        decidedAt: completedEvt.at,
        sectionId: GATE_SECTION[g] ?? "final",
      };
    }
    if (pendingEvt) {
      return {
        id: g,
        label: HITL_LABEL[g] ?? g,
        status: "pending",
        sectionId: GATE_SECTION[g] ?? "final",
      };
    }
    return {
      id: g,
      label: HITL_LABEL[g] ?? g,
      status: "queued",
      sectionId: GATE_SECTION[g] ?? "final",
    };
  });
}

export { RULE_LABEL, HITL_LABEL, SECTION_GATE };
