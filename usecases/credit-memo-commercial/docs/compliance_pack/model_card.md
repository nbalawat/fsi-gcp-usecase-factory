# Model Card — credit-memo-commercial

**Generated from:** usecases/credit-memo-commercial/reasons.yaml  
**Framework:** SR 11-7  
**Last generated:** 2026-05-07  
**Status:** Draft (pending architecture + compliance review)

---

## 1. Model Purpose (SR 11-7 §II.A)

Generate a commercial credit memo for a new or renewing C&I loan, including financial spreading, peer benchmarking, covenant analysis, and a recommended decision with a narrative justification cited back to source documents.

**Trigger event:** `loans.application.submitted` (Pub/Sub)  
**Desired outcome:** Approved memo + GL posting + document store record, within 48 hours of application. Credit officer sees the memo with a regulatory clock and citation density inline; approves, declines with reason, or returns for revision.  
**Primary user:** Credit officer reviewing memo in approval queue (Gemini Enterprise)  
**Regulatory regime:** OCC, Reg O, CECL

---

## 2. Methodology (SR 11-7 §II.B — Conceptual Soundness)

**Approach:** `pipeline-originator@1.0` archetype with `extractor-spreader-rater-drafter@1.0` multi-agent pattern.

The pipeline decomposes credit memo assembly into four sequenced concerns: document extraction, financial spreading, risk rating, and narrative drafting. Each concern is handled by a specialist agent operating on structured outputs from the prior step. No agent performs raw financial computation — all quantitative analysis is delegated to purpose-built atomic services, ensuring model outputs are always grounded in deterministic calculation results. The rules engine enforces regulatory thresholds and approval authority requirements as hard gates, not as model judgments.

**Design trade-offs:**

- Verbosity over speed for memo prose — credit officers value depth
- Citations over inferred narratives — every claim links back to an atomic-service output
- Approval-gate latency over auto-approval — regulatory expectation
- Memory Bank scope is `borrower_id`, not `loan_id` — memo benefits from prior covenant and peer-set decisions on the same borrower

**Why this is conceptually sound under SR 11-7:**  
LLM-based decisioning risk is mitigated by strict separation of concerns: the model generates prose and makes categorical judgments (pass/special-mention/substandard/doubtful/loss) against a defined rubric, but never computes DSCR, covenant headroom, or exposure percentages. All numeric inputs to the model come from verifiable, deterministic atomic services. The human-in-the-loop approval gate ensures no irrevocable financial action (GL posting) occurs without a credentialed credit officer's explicit action.

---

## 3. Model Components (SR 11-7 §II.B — Implementation)

### Agents

| Role | Archetype | Key Parameters |
|---|---|---|
| **extractor** | `document-extractor@1.0` | document_types: [10-K, 10-Q, audited-financials, board-minutes]; target_schema: commercial-financial-statement-v1 |
| **rater** | `risk-rater@1.0` | rubric: commercial-credit-rubric-v1; bands: [1-pass, 2-special-mention, 3-substandard, 4-doubtful, 5-loss] |
| **drafter** | `narrative-drafter@1.0` | output_format: credit-memo-occ-v1; max_words: 1500; citation_density_min: 0.8 |
| **supervisor** | `extractor-spreader-rater-drafter@1.0` | sub_agents: [extractor, rater, drafter]; memory_scope: borrower; output_schema: CreditMemoBundle |

**Underlying model:** `claude-opus-4-7` for all agents (long-form reasoning, document IQ, narratives, multi-step decisioning). Approved per CLAUDE.md model list.

### Atomic Services

All services below are deterministic, stateless computation units. They do not call other atomic services. Agents call them through the workflow; no agent calls an external API directly.

| Service | Inputs | Outputs |
|---|---|---|
| `financial-spreader` | extracted_financials | spread_balance_sheet, spread_income_statement, spread_cash_flow, ratios |
| `dscr-calculator` | spread_income_statement, loan_terms, scenarios | dscr_base, dscr_stressed, min_dscr_breach |
| `covenant-analyzer` | proposed_covenants, spread_financials, trailing_quarters | covenant_test_results, headroom_pct, violations_projected |
| `peer-benchmarker` | borrower_naics, borrower_size_band, borrower_ratios | peer_set, ratio_percentiles |
| `industry-risk-scorer` | naics_code, vintage, geography | industry_risk_band, rationale_factors |
| `collateral-valuator` | collateral_descriptions, valuation_date | valuation_per_item, haircut_per_item, lendable_value |
| `exposure-aggregator` | borrower_id, as_of_date | existing_exposure_committed, existing_exposure_outstanding, single_borrower_pct |
| `ofac-screen` | borrower_id | screen_result (to be promoted to shared library post-pilot) |

### Rules Engine

Rules are evaluated by the shared `rules-service` (GoRules Zen wrapper). No business logic lives in Python `if/else` blocks or agent prompts.

| Rule Reference | Version | What It Enforces |
|---|---|---|
| `regulatory_thresholds` | 2026-Q2 | OCC threshold compliance on loan amount, borrower type, and single-borrower percentage; blocks pipeline on breach |
| `single_borrower_exposure` | v1.0 | Computes headroom against Tier 1 capital; satisfies Reg O insider/concentration limits; blocks on limit breach |
| `approval_matrix_commercial` | v1.0 | Determines required approval authority level and additional reviewers based on loan amount, risk band, and industry risk band |

### Workflow Fragments

| Fragment | Purpose |
|---|---|
| `fan-out-join@1.0` | Parallel atomic service invocation with barrier join |
| `agent-call-with-retry@1.0` | Resilient agent invocation with exponential back-off |
| `approval-gate@1.0` | Cloud Workflows callback; blocks GL posting pending credit officer action |
| `regulatory-clock@1.0` | Publishes to regclock topic; fires alarm at 5-business-day boundary |
| `sink-fanout@1.0` | Parallel writes to all downstream sinks |
| `dlq-on-failure@1.0` | DLQ routing on unrecoverable failures |

---

## 4. Limitations and Boundary Conditions (SR 11-7 §II.B)

**Cost ceiling:** $3.00 per invocation enforced via GCP budget alert. Invocations projected to exceed this limit are throttled before agent calls are made. Monthly ceiling: $9,000.

**Latency budget:** Agent pipeline p99 ≤ 120,000 ms (2 minutes) for memo production. The regulatory clock permits up to 5 business days for the full cycle including human approval. The pipeline targets p95 ≤ 3 business days, p99 ≤ 5 business days end-to-end.

**Regulatory clock:** Initial credit decision must be communicated within 5 business days of complete application receipt (OCC expectation). The `regulatory-clock@1.0` workflow fragment enforces this by publishing countdown events and triggering alarms.

**PII handling:** Borrower financial data is PII-adjacent. The redacting-logger strips or masks sensitive fields before any data is passed to a model call. No PII appears in agent prompts or logs.

**Scope boundary — Memory Bank:** The Memory Bank scope is `borrower_id`. Cross-borrower memory retrieval is architecturally forbidden without explicit architecture review sign-off. This prevents inadvertent borrower data leakage across credit analyses.

**Model non-determinism:** LLM outputs (memo prose, risk band assignments) are non-deterministic. Mitigations: (a) all quantitative claims are sourced from deterministic atomic services; (b) citation density enforcement (≥ 0.8) ensures every claim is traceable; (c) human approval gate intercepts the output before any irrevocable financial action.

**Out-of-scope document types:** The extractor is configured for 10-K, 10-Q, audited-financials, and board-minutes. Unrecognized document types are flagged and returned to the submitter; the pipeline does not attempt extraction on unsupported formats.

**Single-borrower exposure limit breach:** If `single_borrower_exposure` rule evaluates to a limit breach, the pipeline halts and routes to the DLQ with a `LIMIT_BREACH` status. No memo is drafted and no approval queue entry is created.

---

## 5. Governance and Monitoring (SR 11-7 §II.C)

**SLO:** p99 latency ≤ 300s (agent pipeline) with end-to-end regulatory target of 5 business days; agent error rate ≤ 0.5%.

**Regulatory clock:** Initial credit decision communicated within 5 business days of complete application (OCC expectation).

**Model owner:** Commercial Lending Platform — platform-team@bank.example.com

**Approval authority for model changes:**
- Prompt changes: architecture review via `/fsi-prompt-update`
- Rule threshold changes: compliance review + versioned JDM artifact update
- Archetype changes: full `/review-uc` cycle required

**Inherited norms:**
- The 5-step paradigm (handler → atomic services → rules → agent → sinks); no step may be bypassed
- Approved models only: `claude-opus-4-7` for reasoning/narrative; `gemini-3-1-flash` for real-time scoring
- Forbidden patterns enforced by architecture-auditor pre-commit hook
- Required documentation artifacts for every use case

**Use-case-specific norms:**
- Memo prose ≤ 1,500 words; section structure prescribed by credit-memo-occ-v1 template
- Every claim in the memo MUST cite at least one atomic-service output (citation_density_min: 0.8)
- Borrower financials are PII-adjacent; redact in agent prompts via the redacting-logger
- Memory Bank scope is `borrower_id`; cross-borrower memory is forbidden without architecture review

---

## 6. Ongoing Monitoring

| Activity | Frequency | Method |
|---|---|---|
| Architecture audit | Pre-commit | Automated (architecture-auditor hook) |
| Compliance review | Pre-promote | Automated (compliance-reviewer) |
| Security review | Pre-promote | Automated (security-reviewer) |
| Citation density check | Per memo | Automated (supervisor agent validation) |
| Risk band distribution check | Weekly | Automated (Cloud Monitoring; alert on drift from 65/25/10 approve/decline/refer targets) |
| Model performance review | Quarterly | Manual — Commercial Lending Platform + Model Risk Management |
| REASONS drift check | Every PR touching `agents/` or `workflow/` | Automated pre-commit hook |
| Regulatory clock breach review | On every breach event | Manual — compliance officer notified via Cloud Alerting |
| CECL feed validation | Monthly | Manual — Finance confirmed DSCR and risk rating outputs match CECL model inputs |

---

*This document is generated from `usecases/credit-memo-commercial/reasons.yaml`. Do not edit directly — update reasons.yaml and regenerate via `/fsi-build-parallel`.*
