# Model Card — credit-memo-commercial

**Generated from:** usecases/credit-memo-commercial/reasons.yaml
**Framework:** SR 11-7
**Generated:** 2026-05-06
**Status:** Draft — pending architecture and compliance review

---

## 1. Model Purpose (SR 11-7 §II.A)

Generate a commercial credit memo for a new or renewing C&I loan, including financial spreading, peer benchmarking, covenant analysis, and a recommended decision with a narrative justification cited back to source documents.

**Trigger:** loans.application.submitted
**Outcome:** Approved memo + GL posting + document store record, within 48 hours of application. Credit officer sees the memo with a regulatory clock and citation density inline; approves, declines with reason, or returns for revision.
**Primary user:** Credit officer reviewing memo in approval queue (Gemini Enterprise)
**Regulatory regime:** OCC, Reg O, CECL

---

## 2. Conceptual Soundness (SR 11-7 §II.B)

**Approach:** pipeline-originator@1.0 with extractor-spreader-rater-drafter@1.0

The pipeline-originator pattern ingests a loan application event, fans out to eight atomic services running in parallel, aggregates their outputs through a rules engine, and orchestrates a four-agent sequence (extractor → spreader → rater → drafter) to produce a structured credit memo. No agent can approve or decline a loan; all decisions remain with a human credit officer who acts on the memo through the approval queue.

**Design trade-offs:**

- Verbosity over speed for memo prose — credit officers value depth
- Citations over inferred narratives — every claim links back to an atomic-service output
- Approval-gate latency over auto-approval — regulatory expectation
- Memory Bank scope is borrower_id, not loan_id — memo benefits from prior covenant and peer-set decisions on the same borrower

---

## 3. Implementation (SR 11-7 §II.B)

### Agents

| Role | Archetype | Memory Scope | Output Schema |
|---|---|---|---|
| extractor | document-extractor@1.0 | borrower | ExtractedFinancials |
| rater | risk-rater@1.0 | borrower | RiskRating |
| drafter | narrative-drafter@1.0 | borrower | CreditMemo |
| supervisor | extractor-spreader-rater-drafter@1.0 | borrower | CreditMemoBundle |

**Model:** claude-opus-4-7 for all agents (long-form reasoning, narrative generation, multi-step decisioning). No other models used in production without explicit architecture exception.

### Atomic Services (8)

| Service | Purpose | Key Outputs |
|---|---|---|
| financial-spreader | Parses extracted financials into standardized spread | spread_balance_sheet, spread_income_statement, ratios |
| dscr-calculator | Debt-service coverage ratio under base and stress scenarios | dscr_base, dscr_stressed, min_dscr_breach |
| covenant-analyzer | Tests proposed covenants against borrower run-rate financials | covenant_test_results, headroom_pct, violations_projected |
| peer-benchmarker | Selects peer set; computes percentile ratios | peer_set, ratio_percentiles |
| industry-risk-scorer | NAICS-based industry risk band | industry_risk_band, rationale_factors |
| collateral-valuator | Marks collateral to current market with haircuts | valuation_per_item, haircut_per_item, lendable_value |
| exposure-aggregator | Rolls up existing borrower exposure across the bank | existing_exposure_committed, single_borrower_pct |
| ofac-screen | OFAC screening (to be promoted to library after pilot) | ofac_match, match_detail |

### Rules Engine (3 JDM Rules)

| Rule | Version | Key Inputs | Key Outputs |
|---|---|---|---|
| regulatory_thresholds | 2026-q2 | loan_amount, borrower_type, single_borrower_pct | threshold_breaches |
| single_borrower_exposure | 1.0 | proposed_amount, existing_exposure_committed, tier1_capital | limit_status, headroom_dollars |
| approval_matrix_commercial | 1.0 | loan_amount, risk_band, industry_risk_band, single_borrower_pct | approval_authority_required, additional_reviewers |

All rules live in the GoRules Zen rules-service. Thresholds are read from BigQuery threshold tables versioned by effective_date. No hardcoded thresholds exist in code.

---

## 4. Boundary Conditions (SR 11-7 §II.B)

**Cost ceiling:** $3.00 per invocation
**Monthly cost cap:** $9,000.00
**Latency SLO:** p99 ≤ 5 hours from submission to memo ready (18,000,000 ms)
**Error rate max:** 0.5%
**Regulatory clock:** Initial credit decision within 5 business days (OCC expectation, communicated to borrower)

**Prohibited actions:**

- No auto-approval of any loan — all decisions go through credit officer
- No PII in agent prompts — redacting-logger enforced before every model call
- No cross-borrower memory access — Memory Bank scoped strictly to borrower_id
- No direct external API calls from agents — all integrations go through atomic services or MCP tools
- No hardcoded thresholds in code — all thresholds in BigQuery, versioned by effective_date
- GL posting never fires without credit officer approval — approval-gate@1.0 fragment required

**In-scope document types:** 10-K, 10-Q, audited-financials, board-minutes

**Out-of-scope:** Consumer lending, mortgage origination, trade finance letters of credit, loan modifications or restructurings after origination.

---

## 5. Governance (SR 11-7 §II.C)

**Inherited controls (from CLAUDE.md platform norms):**

- The 5-step paradigm: handler → atomic services → rules → agent → sinks — no step may be bypassed
- Approved models only: claude-opus-4-7 and gemini-3-1-flash; all others require explicit architecture exception
- Forbidden patterns enforced by pre-commit architecture-auditor: no business rules in Python if/else, no atomic service calling another, no YAML workflow over 500 lines, no PII in logs
- Every irrevocable action goes through the approval queue — never auto-executed

**Use-case-specific controls:**

- Memo prose limited to 1500 words; structure prescribed by credit-memo-occ-v1 template
- Citation density minimum 0.8 — every claim must link to at least one atomic-service output
- Borrower financials treated as PII-adjacent; redacted in agent prompts via redacting-logger
- Memory Bank scope is borrower_id; cross-borrower memory forbidden without architecture review
- Borrower financials encrypted at rest with CMEK
- Approval queue access restricted to credit-officer role; auditable via Cloud Logging

**Ongoing monitoring:**

- Quarterly MRM review against SR 11-7 model risk standards
- Pre-commit architecture audit via /review-uc on every change
- Pre-promote compliance review before staging or production deployment
- Regulatory clock monitoring: automated P1 alarm if initial decision not communicated within 5 business days
- Citation density monitored per invocation; alerts if < 0.8

**Change management:**

- Behavior changes go through /fsi-prompt-update (not direct code edits)
- Refactors go through /fsi-sync
- Rule changes require golden test set validation before deployment

---

## 6. Limitations (SR 11-7 §II.A)

- Model generates a recommended decision; a human credit officer makes the final credit determination. The model is not the credit decision-maker.
- Financial spreading quality depends on document quality supplied by the RM. Compiled or unreviewed financials reduce reliability of spread outputs; the memo must flag the financial statement quality.
- Peer benchmarking uses a synthetic peer set in demo and a configurable industry data feed in production; peer set composition is not audited in real time.
- Memo output is capped at 1,500 words; complex credits may require supplemental analysis outside this pipeline.
- Memory Bank retains borrower-level context from prior runs; stale data from a prior period could influence a current memo if the borrower's situation has changed materially. RMs must verify that prior-period context is still applicable.

---

*Do not edit directly — regenerate from reasons.yaml via /fsi-build-parallel*
