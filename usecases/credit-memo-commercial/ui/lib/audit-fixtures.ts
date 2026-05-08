/**
 * Mock audit-trail fixtures for development. Used only when:
 *   - process.env.NODE_ENV === "development"
 *   - the URL carries `?mock=1`
 *
 * The parallel agent owns the real `useLiveAuditTrail` hook against
 * `application_events` + the SSE stream. This module exists so the audit-trail
 * UI can be built and visually walked before the data layer lands.
 */

import type { AuditEvent, AuditTotals } from "./types";

const NOW = Date.now();
const t = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();

export const MOCK_EVENTS: AuditEvent[] = [
  {
    id: 1,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "stage_entered",
    service_name: "workflow",
    payload: { stage: "intake", actor: "system" },
    occurred_at: t(-73_000),
    latency_ms: 12,
    cost_usd: 0,
  },
  {
    id: 2,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "service_invoked",
    service_name: "svc-financial-spreader",
    payload: { input_hash: "9f1a…c042", output_hash: "8b07…71ee" },
    occurred_at: t(-71_000),
    latency_ms: 980,
    cost_usd: 0.0024,
  },
  {
    id: 3,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "agent_action",
    service_name: "agent-document-classifier",
    payload: {
      agent_role: "document_classifier",
      agent_version: "v1.4.2",
      model: "gemini-3-1-flash",
      model_params: { temperature: 0.0, max_tokens: 1024 },
      started_at: t(-70_000),
      completed_at: t(-66_500),
      tokens: { input: 4218, output: 412, thinking: 0 },
      memory_scope: "application:DEMO-APP-MFG-001-2026",
      memory_keys_read: ["uploaded_documents"],
      tools_invoked: [],
      inputs_summary:
        "12 pages of borrower-uploaded PDFs and a 4-tab financial workbook.",
      reasoning_trace:
        "Classified each upload by inspecting the first-page text + structural cues. The workbook had recognizable spreader columns (revenue, COGS, EBITDA) so I tagged it as 'financials'. The 12-page PDF carried covenant language and a signature block — that's a 'loan_agreement_draft'. Two scanned bank statements rounded out the package. No unclassifiable artefacts.\n\nExtraction confidence is high because every document had a primary cue within the first page; nothing required full-document scanning.",
      output_summary:
        "Classified 4 documents: financials, loan agreement draft, bank statement, bank statement.",
      output_full: {
        documents: [
          { name: "financials.xlsx", type: "financials", confidence: 0.99 },
          {
            name: "loan_agreement.pdf",
            type: "loan_agreement_draft",
            confidence: 0.96,
          },
          { name: "stmt_q3.pdf", type: "bank_statement", confidence: 0.94 },
          { name: "stmt_q4.pdf", type: "bank_statement", confidence: 0.94 },
        ],
      },
      confidence: 0.96,
      citations: [
        {
          source: "financials.xlsx",
          page: 1,
          section: "Sheet 1",
          excerpt:
            "Revenue 2024 — $84,210,000; COGS $61,380,000; EBITDA $14,200,000",
          claim: "Workbook is a financial spread",
          kind: "spreadsheet",
          url: "/documents/financials.xlsx",
        },
        {
          source: "loan_agreement.pdf",
          page: 3,
          section: "Article IV",
          excerpt: "Borrower shall maintain a Debt Service Coverage Ratio…",
          claim: "PDF contains covenant covenants",
          kind: "pdf",
          url: "/documents/loan_agreement.pdf#page=3",
        },
      ],
    },
    occurred_at: t(-66_500),
    latency_ms: 3500,
    cost_usd: 0.0089,
  },
  {
    id: 4,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "rule_evaluated",
    service_name: "rule-document-completeness",
    payload: {
      rule: "rule-document-completeness",
      result: "pass",
      reason: "All required document types present.",
    },
    occurred_at: t(-65_500),
    latency_ms: 18,
    cost_usd: 0,
  },
  {
    id: 5,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "service_invoked",
    service_name: "svc-dscr-calculator",
    payload: {
      input_hash: "7c91…aa18",
      output_hash: "df04…bc73",
      result: { dscr_base: 3.82, dscr_stressed: 2.94 },
    },
    occurred_at: t(-60_000),
    latency_ms: 410,
    cost_usd: 0.0014,
  },
  {
    id: 6,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "agent_action",
    service_name: "agent-rater",
    payload: {
      agent_role: "rater",
      agent_version: "v2.1.0",
      model: "claude-opus-4-7",
      model_params: { temperature: 0.2, max_tokens: 4096, thinking_effort: "medium" },
      started_at: t(-58_000),
      completed_at: t(-51_600),
      tokens: { input: 11_201, output: 1842, thinking: 4310 },
      memory_scope: "application:DEMO-APP-MFG-001-2026",
      memory_keys_read: ["spread_v1", "industry_benchmarks_naics_332"],
      tools_invoked: [
        {
          name: "svc-peer-benchmarker",
          url: "/api/services/peer-benchmarker",
          latency_ms: 312,
          input_hash: "11aa…ff03",
          output_hash: "22bb…4407",
        },
        {
          name: "svc-industry-risk-scorer",
          url: "/api/services/industry-risk-scorer",
          latency_ms: 198,
          input_hash: "33cc…1144",
          output_hash: "44dd…5588",
        },
      ],
      inputs_summary:
        "Spread financials, NAICS 332 peer cohort medians, prior 12 quarters of statements.",
      reasoning_trace:
        "Borrower's DSCR (3.82x base, 2.94x stressed) lands well above the 1.25x covenant minimum. Leverage of 1.76x is in the first quartile against the NAICS 332 fabricated metals peer set. Industry risk score is moderate — fabricated metals carries cyclicality but the borrower's customer concentration is broad.\n\nNo single risk factor pushes this beyond pass. The relationship is 12 years and clean. I'm landing on risk band 1-pass with high confidence.",
      output_summary: "Risk band 1-pass; rationale: strong DSCR, conservative leverage, clean relationship.",
      output_full: {
        risk_band: "1-pass",
        confidence: 0.94,
        rationale_short: "Strong DSCR; first-quartile leverage; clean 12y relationship.",
      },
      confidence: 0.94,
      citations: [
        {
          source: "svc-financial-spreader",
          page: 0,
          section: "ratios",
          excerpt: "DSCR_base = 3.82; DSCR_stressed = 2.94",
          claim: "DSCR exceeds 1.25x minimum",
          kind: "service-output",
          url: "/api/audit/event/5",
        },
        {
          source: "svc-peer-benchmarker",
          page: 0,
          section: "naics-332",
          excerpt: "Leverage P25 = 2.10; borrower 1.76",
          claim: "First-quartile leverage vs peers",
          kind: "service-output",
          url: "/api/audit/event/6/tool/0",
        },
      ],
    },
    occurred_at: t(-51_600),
    latency_ms: 6400,
    cost_usd: 0.187,
  },
  {
    id: 7,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "rule_evaluated",
    service_name: "rule-single-borrower-limit",
    payload: {
      rule: "rule-single-borrower-limit",
      result: "pass",
      reason: "Post-close exposure 1.3% of Tier 1 — within 8% limit.",
    },
    occurred_at: t(-49_000),
    latency_ms: 22,
    cost_usd: 0,
  },
  {
    id: 8,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "rule_evaluated",
    service_name: "rule-covenant-floor",
    payload: {
      rule: "rule-covenant-floor",
      result: "pass",
      reason: "Stressed DSCR 2.94x > 1.25x covenant floor.",
    },
    occurred_at: t(-48_000),
    latency_ms: 16,
    cost_usd: 0,
  },
  {
    id: 9,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "agent_action",
    service_name: "agent-drafter",
    payload: {
      agent_role: "drafter",
      agent_version: "v3.0.1",
      model: "claude-opus-4-7",
      model_params: { temperature: 0.4, max_tokens: 8192, thinking_effort: "high" },
      started_at: t(-46_000),
      completed_at: t(-32_500),
      tokens: { input: 18_402, output: 4128, thinking: 9810 },
      memory_scope: "application:DEMO-APP-MFG-001-2026",
      memory_keys_read: ["rater_output", "spread_v1"],
      tools_invoked: [
        {
          name: "svc-citation-formatter",
          url: "/api/services/citation-formatter",
          latency_ms: 84,
          input_hash: "55ee…9911",
          output_hash: "66ff…aa22",
        },
      ],
      inputs_summary:
        "Risk-band rationale, financial spread, peer benchmarks, covenant rule outcomes.",
      reasoning_trace:
        "Drafted the credit memo following the bank's standard memo template. Each numerical claim is back-cited to either the spread output or a service result. I lead with the recommendation (approve) and the three-sentence justification, then provide the full risk-factor table and supporting analysis.\n\nSelected the Approve recommendation given (1) strong DSCR with substantial buffer over covenant floor, (2) first-quartile leverage versus peers, and (3) clean exposure relative to the OCC single-borrower limit. No structural changes recommended; suggested standard reporting cadence.",
      output_summary:
        "Memo complete: approve recommendation with full reasoning + 14 citations.",
      output_full: {
        recommendation: "APPROVE",
        memo_paragraphs: 9,
        citation_count: 14,
        approval_authority: "credit_committee",
      },
      confidence: 0.93,
      citations: [
        {
          source: "agent-rater",
          page: 0,
          section: "rationale",
          excerpt: "Risk band 1-pass…",
          claim: "Risk-band assignment",
          kind: "agent-output",
          url: "/api/audit/event/6",
        },
        {
          source: "rule-covenant-floor",
          page: 0,
          section: "result",
          excerpt: "Stressed DSCR 2.94x > 1.25x covenant floor.",
          claim: "Covenant floor maintained under stress",
          kind: "rule-output",
          url: "/api/audit/event/8",
        },
      ],
    },
    occurred_at: t(-32_500),
    latency_ms: 13_500,
    cost_usd: 0.624,
  },
  {
    id: 10,
    application_id: "DEMO-APP-MFG-001-2026",
    event_type: "decision_made",
    service_name: "workflow",
    payload: { decision: "RECOMMEND_APPROVE", queued_for: "credit_committee" },
    occurred_at: t(-30_000),
    latency_ms: 8,
    cost_usd: 0,
  },
];

export function rollupTotals(events: AuditEvent[]): AuditTotals {
  let latencyMs = 0;
  let costUsd = 0;
  let agentCount = 0;
  let ruleCount = 0;
  let serviceCount = 0;
  for (const e of events) {
    if (typeof e.latency_ms === "number") latencyMs += e.latency_ms;
    if (typeof e.cost_usd === "number") costUsd += e.cost_usd;
    if (e.event_type === "agent_action") agentCount += 1;
    else if (e.event_type === "rule_evaluated") ruleCount += 1;
    else if (e.event_type === "service_invoked") serviceCount += 1;
  }
  return { latencyMs, costUsd, agentCount, ruleCount, serviceCount };
}

export const MOCK_TOTALS: AuditTotals = rollupTotals(MOCK_EVENTS);
