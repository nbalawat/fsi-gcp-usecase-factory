# Use Case Specification — credit-memo-commercial

**Owner:** Commercial Lending Platform  
**Contact:** platform-team@bank.example.com  
**Phase:** Intake  
**Last updated:** 2026-05-07

---

## Problem Statement

Commercial credit officers manually assemble credit memos for C&I loan applications by pulling financial data from uploaded statements, running ratio calculations in spreadsheets, consulting industry benchmarks, and drafting narrative justifications from scratch. This process is time-consuming, inconsistently documented, and difficult to audit. Regulatory examiners (OCC) expect a defensible, citation-rich credit memo delivered within a defined regulatory clock window. This use case automates memo assembly through a supervised multi-agent pipeline, leaving the credit officer responsible only for the final approve/decline/revise decision.

---

## Definition of Done

A use case invocation is complete when ALL of the following are true:

1. Financial statements have been extracted and spread into standard schema fields.
2. DSCR (base and stressed), covenant headroom, peer percentiles, industry risk band, collateral lendable value, and single-borrower exposure have been computed by dedicated atomic services.
3. Rules engine has evaluated regulatory thresholds, single-borrower exposure limits, and approval authority matrix.
4. A credit memo draft (≤ 1,500 words, citation density ≥ 0.8, OCC format v1) has been produced by the drafter agent and validated by the supervisor.
5. The memo has been routed to the credit-officer approval queue with the regulatory clock displayed.
6. A credit officer has approved, declined (with reason), or returned the memo for revision within 5 business days of complete application receipt.
7. On approval: GL posting has been recorded in `gl_ledger.credit_memo_postings` and the final memo artifact has been written to GCS at `credit-memo-commercial/{borrower_id}/{context_id}/memo.json`.
8. All service calls, agent invocations, rule evaluations, and the human approval action are captured in BigQuery audit tables under the originating `context_id`.

---

## Primary User

Credit officer reviewing memo in the approval queue (pipeline console, Gemini Enterprise).

---

## Trigger and Outcome

| | |
|---|---|
| **Trigger** | `loans.application.submitted` (Pub/Sub) |
| **Outcome** | Approved credit memo + GL posting + GCS document artifact |
| **Latency budget** | Memo ready for officer review within 5 hours (p99); credit decision within 5 business days (regulatory) |

---

## Regulatory Regime

| Regulator / Rule | Requirement |
|---|---|
| OCC Credit Risk Management Handbook | Documented credit analysis; memo format; approval authority matrix |
| SR 11-7 (Federal Reserve) | Model risk management for LLM-based credit decisioning tools |
| Reg O (12 CFR Part 215) | Insider lending — single-borrower exposure limits enforced at rules layer |
| CECL (ASC 326) | Credit loss provisioning — DSCR and risk rating feed downstream CECL models |

---

## Component Inventory

### Handler (Step 1)
| Component | Path |
|---|---|
| `credit-memo-commercial` handler | `usecases/credit-memo-commercial/handler/main.py` |

Triggered by `loans.application.submitted`. Enriches the event with borrower master data and financial-statement blob references, then publishes to the workflow.

### Atomic Services (Step 2) — 8 services, all new in this pilot
| Service | Responsibility |
|---|---|
| `financial-spreader` | Parses extracted financials into standard spread schema; outputs balance sheet, income statement, cash flow, and ratios |
| `dscr-calculator` | Computes debt-service coverage ratio under base and stressed scenarios |
| `covenant-analyzer` | Tests proposed covenants against trailing-quarter financials; projects headroom and violations |
| `peer-benchmarker` | Selects NAICS peer set; computes ratio percentiles against peers |
| `industry-risk-scorer` | Assigns industry risk band from NAICS code, vintage, and geography |
| `collateral-valuator` | Marks collateral to market with standard haircuts; outputs lendable value per item |
| `exposure-aggregator` | Aggregates borrower's committed and outstanding exposure across the bank; computes single-borrower percentage |
| `ofac-screen` | OFAC screening; to be promoted to shared library after pilot ships |

### Rules Engine (Step 3)
| Rule | Version | Purpose |
|---|---|---|
| `regulatory_thresholds` | 2026-Q2 | Enforces OCC regulatory threshold breaches on loan amount, borrower type, and single-borrower percentage |
| `single_borrower_exposure` | v1.0 | Computes headroom against Tier 1 capital; blocks progression on limit breach |
| `approval_matrix_commercial` | v1.0 | Determines required approval authority and additional reviewers based on amount, risk band, and industry band |

### Agents (Step 4)
| Agent | Archetype | Responsibility |
|---|---|---|
| `credit_memo_supervisor` | `extractor-spreader-rater-drafter@1.0` | Orchestrates sub-agents; validates bundle completeness before routing to approval queue |
| `credit_memo_extractor` | `document-extractor@1.0` | Extracts structured fields from 10-K, 10-Q, audited financials, and board minutes |
| `credit_memo_rater` | `risk-rater@1.0` | Assigns OCC risk band (1–5) using commercial credit rubric; calls all analytical atomic services |
| `credit_memo_drafter` | `narrative-drafter@1.0` | Drafts OCC-format credit memo prose; enforces citation density ≥ 0.8 |

All agents run on `claude-opus-4-7` (long-form reasoning, narrative, multi-step decisioning).

### Cloud Workflows (Step 3 orchestration)
| Fragment | Purpose |
|---|---|
| `fan-out-join@1.0` | Parallel invocation of atomic services; waits for all before proceeding |
| `agent-call-with-retry@1.0` | Resilient agent invocation with exponential back-off |
| `approval-gate@1.0` | Callback pattern; blocks GL posting until credit officer acts |
| `regulatory-clock@1.0` | Publishes to `regclock-credit-memo-commercial`; alarms at clock breach |
| `sink-fanout@1.0` | Parallel writes to credit-officer-queue, document-store-gcs, gl-posting (approval only) |
| `dlq-on-failure@1.0` | Routes failures to `credit-memo-commercial.dlq` |

### Sinks (Step 5)
| Sink | Trigger |
|---|---|
| `credit-officer-queue` | Always — routes memo draft to Gemini Enterprise approval queue |
| `document-store-gcs` | Always — writes versioned memo JSON to GCS |
| `gl-posting` | On approval only — never auto-fires |

---

## Key Constraints

- GL posting MUST go through the human approval gate; auto-execution is forbidden.
- No PII in agent prompts; redact via the redacting-logger before any model call.
- Memo prose ≤ 1,500 words; OCC credit-memo-occ-v1 section structure required.
- Every claim in the memo must cite at least one atomic-service output (citation density ≥ 0.8).
- Memory Bank scope is `borrower_id`; cross-borrower memory retrieval is forbidden without architecture review.
- Borrower financials encrypted at rest with CMEK.

---

## SLOs

| Metric | Target |
|---|---|
| Handler enrichment | p99 ≤ 2,000 ms |
| Atomic service fan-out | p99 ≤ 5,000 ms |
| Rules service | p99 ≤ 500 ms |
| Agent pipeline total | p99 ≤ 120,000 ms (2 min) |
| Approval gate | max 120 hours (5 business days) |
| End-to-end (memo ready) | p95 ≤ 3 business days, p99 ≤ 5 business days |
| Handler error rate | ≤ 0.1% |
| Agent error rate | ≤ 0.5% |
| Cost per memo | ≤ $3.00 |
| Monthly cost ceiling | ≤ $9,000 |
