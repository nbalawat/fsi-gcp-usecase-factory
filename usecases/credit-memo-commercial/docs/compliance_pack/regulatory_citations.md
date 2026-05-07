# Regulatory Citations — credit-memo-commercial

**Framework:** SR 11-7  
**Last updated:** 2026-05-07

This document maps specific regulatory requirements to the controls and design decisions implemented in the credit-memo-commercial use case. Citations are traceable to `usecases/credit-memo-commercial/reasons.yaml`.

---

## 1. OCC Credit Risk Management Handbook

**Source:** OCC Comptroller's Handbook, "Credit Risk Management" (October 2020)

### 1.1 Credit Analysis Documentation

**Requirement:** National banks must maintain documented credit analysis for commercial loans, including financial analysis, industry assessment, and narrative justification for the credit decision.

**How this use case addresses it:**
- The `credit-memo-occ-v1` template enforces the OCC-required memo section structure on every produced memo.
- The `credit_memo_drafter` agent is constrained to ≤ 1,500 words with section structure prescribed by the template; free-form deviation is rejected by the supervisor agent.
- Financial analysis is sourced from `financial-spreader` (spread financials, ratios), `dscr-calculator` (DSCR base and stressed), and `covenant-analyzer` (covenant headroom).
- Industry assessment is sourced from `industry-risk-scorer` (NAICS-based industry risk band with rationale factors) and `peer-benchmarker` (peer set and ratio percentiles).
- Narrative justification citation density ≥ 0.8 is enforced by the supervisor; every claim links back to an atomic-service output field, making the source traceable to an examiner.

### 1.2 Credit Officer Approval Authority

**Requirement:** Credit decisions above defined thresholds must be made or approved by an officer with the appropriate delegated lending authority.

**How this use case addresses it:**
- `approval_matrix_commercial@1.0` rule determines the required approval authority level based on loan amount, risk band, and industry risk band before the memo is routed.
- The approval queue (`credit-officer-queue`) is access-restricted to the `credit-officer` IAM role.
- The Cloud Workflows `approval-gate@1.0` fragment enforces that GL posting cannot occur without a credit officer's explicit approval action — the callback token architecture makes this an architectural guarantee, not an application convention.
- The credit officer's identity (`acted_by`), action, and timestamp are recorded in `audit.approval_events` and are available to OCC examiners.

### 1.3 Collateral Valuation

**Requirement:** Collateral must be valued using current market data with appropriate haircuts; valuation must be documented.

**How this use case addresses it:**
- `collateral-valuator` atomic service marks collateral to current market as of `valuation_date` and applies standard haircuts, outputting `valuation_per_item`, `haircut_per_item`, and `lendable_value`.
- Valuation outputs are passed to the drafter agent as structured context and cited in the memo.
- Valuation inputs and outputs are logged in `audit.atomic_service_events` with `context_id` linkage.

---

## 2. SR 11-7 — Model Risk Management

**Source:** Federal Reserve / OCC "Supervisory Guidance on Model Risk Management" (SR 11-7 / OCC 2011-12)

### 2.1 Model Definition

**Requirement:** SR 11-7 defines a model as a quantitative method, system, or approach that applies statistical, economic, financial, or mathematical theories, techniques, and assumptions to process input data into quantitative estimates. LLM-based systems used to inform credit decisions meet this definition.

**How this use case addresses it:**
- The bank treats the credit-memo-commercial agent pipeline as a model under SR 11-7. This risk assessment, model card, and audit trail spec constitute the required MRM documentation package.
- Model inventory registration is required before production deployment.

### 2.2 Conceptual Soundness (SR 11-7 §II.B)

**Requirement:** The model's theoretical and empirical basis must be sound; limitations must be documented.

**How this use case addresses it:**
- The multi-agent `extractor-spreader-rater-drafter@1.0` pattern separates non-deterministic LLM tasks (extraction, narrative drafting) from deterministic computation (DSCR, covenant math, exposure aggregation). All quantitative inputs to LLM agents come from atomic services, not from model inference.
- Limitations are documented in model_card.md §4: LLM non-determinism, model versioning risk, out-of-scope document types.
- Trade-offs are documented in model_card.md §2 (verbosity over speed, citations over inference, approval-gate latency over auto-approval).

### 2.3 Ongoing Monitoring (SR 11-7 §II.C)

**Requirement:** Banks must have a process for ongoing monitoring of model performance; metrics must be defined in advance.

**How this use case addresses it:**
- Risk band distribution monitored weekly; alert fires on >10 percentage point drift from 65/25/10 approve/decline/refer targets.
- Citation density distribution monitored per memo; supervisor rejects below-threshold memos.
- Officer override rate tracked in `audit.approval_events`; high override rate signals model degradation.
- Quarterly model performance review by Commercial Lending Platform + Model Risk Management as defined in model_card.md §6.
- REASONS drift check on every PR touching `agents/` or `workflow/`.

### 2.4 Model Validation

**Requirement:** Models must be validated before use and periodically thereafter; validation must be independent of model development.

**How this use case addresses it:**
- Pre-promote compliance-reviewer automated check validates memo output against OCC template before any production deployment.
- Architecture-auditor pre-commit hook enforces structural compliance (5-step paradigm, forbidden patterns, approved models).
- Quarterly review includes comparison of model outputs against credit officer override decisions as a proxy for accuracy.
- Independent validation by Model Risk Management team (separate from Commercial Lending Platform) is required before initial production go-live.

---

## 3. Reg O — Loans to Insiders (12 CFR Part 215)

**Source:** Federal Reserve Regulation O (12 CFR Part 215); OCC equivalent at 12 CFR Part 31

### 3.1 Single-Borrower Exposure Limits

**Requirement:** National banks are subject to legal lending limits; no bank may make loans to a single borrower (or group of related borrowers) in excess of defined percentages of unimpaired capital and surplus. Insider lending is subject to additional restrictions and board approval requirements.

**How this use case addresses it:**
- `exposure-aggregator` atomic service computes the borrower's existing committed and outstanding exposure across the entire bank as of the application date, producing `existing_exposure_committed`, `existing_exposure_outstanding`, and `single_borrower_pct` of Tier 1 capital.
- `single_borrower_exposure@1.0` rule takes `proposed_amount`, `existing_exposure_committed`, and `tier1_capital` as inputs and outputs `limit_status` (PASS or BREACH) and `headroom_dollars`.
- On any BREACH: the pipeline halts immediately; no memo is drafted; no approval queue entry is created; the event is routed to the DLQ with status `LIMIT_BREACH`. This is a hard gate enforced by the rules engine before any LLM processing.
- `regulatory_thresholds@2026-q2` rule additionally evaluates OCC-specific threshold conditions based on borrower type and loan amount.
- All rule evaluations are logged in `audit.rules_service_events` with full input and output values, providing an examiner-accessible record of every exposure limit check.

### 3.2 Board Approval for Insider Loans

**Requirement:** Certain insider loans require advance approval of a majority of the board of directors, documented in board minutes.

**How this use case addresses it:**
- The `approval_matrix_commercial@1.0` rule outputs `approval_authority_required` and `additional_reviewers`; for insider-flagged borrowers, the matrix requires board-level review before approval.
- Board minutes are an accepted input document type for the `credit_memo_extractor` agent (`board-minutes` in `document_types`), enabling extraction of insider relationship disclosures.
- The memo template (`credit-memo-occ-v1`) includes a required section for insider relationship disclosure.

---

## 4. CECL — Current Expected Credit Loss (ASC 326)

**Source:** FASB ASC 326, "Financial Instruments — Credit Losses"; OCC Bulletin 2019-17

### 4.1 Credit Loss Provisioning

**Requirement:** Banks must estimate and provision for expected credit losses over the contractual life of financial instruments. CECL models must incorporate forward-looking information, including economic conditions and borrower-specific factors.

**How this use case addresses it:**
- `dscr-calculator` produces `dscr_base`, `dscr_stressed`, and `min_dscr_breach` under defined economic scenarios. The stressed DSCR is a forward-looking metric that feeds the bank's downstream CECL model.
- `industry-risk-scorer` produces `industry_risk_band` with `rationale_factors` (NAICS-based, vintage-adjusted, geography-adjusted) — a forward-looking industry risk input to CECL.
- The OCC risk band assigned by `credit_memo_rater` (bands 1–5: pass through loss) maps directly to the bank's PD (Probability of Default) and LGD (Loss Given Default) parameters used in CECL provisioning.
- These outputs are published to the downstream CECL model feed via the `credit-memo-commercial.decided` Pub/Sub topic.
- Monthly CECL feed validation (manual, Finance team) confirms that DSCR and risk rating outputs match CECL model inputs. Results are documented in the quarterly model performance review.

### 4.2 Collateral Value in LGD Estimation

**Requirement:** LGD estimates must reflect the value of collateral, net of liquidation costs and time value.

**How this use case addresses it:**
- `collateral-valuator` outputs `lendable_value` (market value net of haircut), which the CECL model uses for LGD estimation.
- Haircut methodology is defined in the `collateral-valuator` service configuration, versioned separately, and subject to the same architecture review process as rule changes.

---

## 5. Bank Secrecy Act / OFAC Screening

**Source:** Bank Secrecy Act (31 U.S.C. 5311 et seq.); OFAC SDN List; 31 CFR Chapter V

### 5.1 OFAC Screening Requirement

**Requirement:** Banks must screen all loan applicants against the OFAC Specially Designated Nationals and Blocked Persons (SDN) list before opening an account or extending credit. Extension of credit to an SDN or in a prohibited jurisdiction constitutes a sanctions violation.

**How this use case addresses it:**
- `ofac-screen` atomic service screens the borrower entity against the OFAC SDN list using `borrower_id` as input, returning a `screen_result`.
- OFAC screening is invoked as part of the atomic service fan-out in the `fan-out-join@1.0` workflow fragment — before any agent pipeline processing begins.
- On a positive OFAC match: the pipeline halts; the event is routed to the DLQ with status `OFAC_MATCH`; the Compliance team is alerted via Cloud Alerting. No memo is drafted.
- OFAC screen results are logged in `audit.atomic_service_events` with `context_id` for regulatory examination.
- Note: `ofac-screen` is a new service built as part of this pilot and will be promoted to the shared atomic service library after pilot validation.

---

## Cross-Reference Matrix

| Regulatory Requirement | Control | Implementation |
|---|---|---|
| OCC — documented credit analysis | `credit-memo-occ-v1` template enforcement | Supervisor agent validation; architecture-auditor hook |
| OCC — approval authority matrix | `approval_matrix_commercial@1.0` rule | rules-service evaluation pre-queue routing |
| OCC — collateral valuation | `collateral-valuator` atomic service | Fan-out; outputs cited in memo |
| SR 11-7 — model documentation | model_card.md, risk_assessment.md, audit_trail_spec.md | This compliance pack |
| SR 11-7 — ongoing monitoring | Weekly distribution check; quarterly MRM review | Cloud Monitoring + calendar cadence |
| SR 11-7 — model validation | Pre-promote compliance-reviewer; architecture-auditor | Automated CI/CD gates |
| Reg O — single-borrower limits | `single_borrower_exposure@1.0` rule + `exposure-aggregator` | Hard gate pre-pipeline |
| Reg O — board approval for insiders | `approval_matrix_commercial@1.0`; board-minutes extraction | Rules gate + agent input |
| CECL — forward-looking credit factors | `dscr-calculator`, `industry-risk-scorer`, OCC risk band | Downstream CECL feed |
| CECL — collateral LGD inputs | `collateral-valuator` lendable_value | Downstream CECL feed |
| BSA/OFAC — SDN screening | `ofac-screen` atomic service | Fan-out pre-pipeline; DLQ on match |

---

*This document is derived from `usecases/credit-memo-commercial/reasons.yaml`. Do not edit directly — update reasons.yaml and regenerate via `/fsi-build-parallel`.*
