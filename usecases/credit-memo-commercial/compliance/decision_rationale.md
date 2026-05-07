# Decision Rationale — credit-memo-commercial

**Use case:** commercial loan credit memo generation
**Required by:** SR 11-7 §III (validation), OCC examiner traceability
**Format:** every credit memo decision must be reproducible from this rationale + the evidence captured at decision time.

This document explains, in plain language, **how the platform produces a credit decision** so that:
- A credit officer reviewing a memo can articulate why the agent recommended what it did.
- An OCC examiner can trace any single decision from input event to GL posting.
- An MRM validator can challenge the methodology without reading the agent prompts.

## How a decision is reached

A credit memo decision is the composition of three independent steps:

### 1. Mechanical computation (atomic services)

For every borrower, seven atomic services compute deterministic numbers from the inputs:

| Atomic service | Computation |
|---|---|
| `financial-spreader` | Standardised income statement, balance sheet, cash flow + ratios |
| `dscr-calculator` | DSCR base + stressed using cash flow waterfall |
| `covenant-analyzer` | Headroom against proposed covenants + 4-quarter linear projection |
| `peer-benchmarker` | NAICS-3 peer set + percentile ranks |
| `industry-risk-scorer` | Industry risk band A–E from sector + macro signals |
| `collateral-valuator` | Lendable value after appraisal + condition haircuts |
| `exposure-aggregator` | Existing exposure + single-borrower-% of Tier 1 |

These services are **fully deterministic**. Same inputs → same outputs. They do not call models. Their outputs are the **factual basis** for everything downstream.

Policy cutoffs (band thresholds, regulatory limits, peer-set minimum size) come from the Cloud SQL `thresholds` table, versioned by `effective_date`. The thresholds are owned by Compliance and updated through MRM-approved changes.

### 2. Rules gate (rules-service)

The atomic-service outputs are evaluated by JDM rules in the bank's GoRules Zen rules-service. For credit-memo-commercial:

- `credit-memo-eligibility.json` — gates on DSCR, single-borrower exposure
- `single_borrower_exposure/v1.json` — OCC 12 CFR 32 single-borrower limit
- `regulatory_thresholds/v2026-q2.json` — current quarter's regulatory thresholds
- `approval_matrix_commercial/v1.json` — approval-tier routing by loan size

The rules-service emits one of: `APPROVE`, `DECLINE`, or `REFER`. **A `DECLINE` from rules ends the workflow** — no agent is called. **An `APPROVE` or `REFER` proceeds to the agent.**

This is the deterministic gate: rules engine reads numbers, applies regulator-mandated tests, returns a decision that any auditor can re-execute by replaying the JDM evaluation against the same inputs.

### 3. Agent narrative + recommendation (judgment layer)

When rules returns `APPROVE` or `REFER`, the agent supervisor orchestrates four specialists:

- `extractor` — structured extraction from uploaded financial documents (10-K, 10-Q, board minutes)
- `rater` — risk band assignment (1-pass through 5-loss) using the OCC classification rubric
- `drafter` — credit memo narrative with citations to atomic-service outputs
- `supervisor` — composes the rater + drafter outputs and packages the memo

The agent **does not bypass the rules gate**. If the agent recommends `APPROVE` but the rules-service emitted `DECLINE`, the workflow honors the rules decision and the agent's recommendation is logged but not actuated.

The agent's only judgments are:
- Which OCC band to assign within the 5-band scale (when multiple service results are mixed-signal)
- The narrative explanation of why
- Whether `requires_human_review` should be true (forces approval gate even on auto-approve cases)

Every band assignment cites the specific service output that drove it via the `factors` array. Every paragraph in the memo cites a service output via `citation_density >= 0.8`.

### 4. Human approval gate

For loans above the approval matrix threshold OR when `requires_human_review = true`:

- The workflow pauses on a Cloud Workflows callback.
- The credit officer reviews the memo in the pipeline-console.
- The credit officer makes one of: **accept**, **edit-and-accept**, **reject**.
- The credit-officer console (running under `credit_officer_app_sa`) publishes to `approval_events`.
- The workflow callback resumes; on accept, the GL-posting sink is invoked.

The agent's service account **cannot** publish to `approval_events`. The Terraform validation block enforces this — it fails the apply if `agent_runtime_sa == credit_officer_app_sa`.

## What the agent does NOT decide

- **The rules layer's APPROVE/DECLINE.** The agent observes it, never overrides it.
- **The atomic-service numerics.** DSCR, headroom, percentiles are computed before the agent runs.
- **The OCC band thresholds.** The bands' numeric cutoffs come from Cloud SQL; the agent reads them and applies them.
- **The final approval.** That's the human credit officer.

## Reconstructing any single decision

For any `context_id`:

1. `audit_events` table → all atomic-service inputs and outputs at that decision time.
2. `audit_events` table → the rules-service decision + reason + threshold_breaches.
3. `audit_events` table → the agent's input (service_results bundle) and emitted memo.
4. `gl_postings` table → the approver and timestamp of the human decision.
5. The exact `thresholds` table rows in effect at that `effective_date` (queryable by historical `effective_date`).
6. The exact JDM rule version (versioned in git, recorded in `rules_result.rule_version`).
7. The exact agent prompt version (from `agents/manifest.yaml` version field, recorded in audit).

This 7-tuple lets any reviewer reproduce the decision deterministically end-to-end.

## Override mechanism

A credit officer who disagrees with the agent's band:

1. Clicks "edit and accept" in the pipeline-console.
2. Records: corrected band, reason code, free-text justification.
3. Override is stored alongside the memo with `override_reason`, `override_by`, `override_at`.
4. The override feeds the eval-harness override-rate metric (target < 5% per `risk_assessment.md`).
5. Persistent override patterns (>10% on a borrower segment) trigger MRM review of the rubric.

The override does not edit the audit trail; it adds to it.

## Owners

| Layer | Owner | Change control |
|---|---|---|
| Atomic-service algorithms | Platform engineering | PR + 2 approvals + golden tests |
| Cloud SQL thresholds | Compliance | `effective_date`-versioned rows; MRM signoff before activation |
| JDM rules | Compliance + Platform | git-versioned; golden tests; quarterly review |
| Agent prompts + rubric | MRM + Platform | `/fsi-prompt-update` + adversarial test pass + MRM signoff |
| Approval matrix | Credit Risk Committee | quarterly review |

## Traceability to SR 11-7 expectations

| SR 11-7 expectation | Where it's covered |
|---|---|
| Statement of model purpose | `model_card.md` §1 |
| Conceptual soundness | This document, §1–3 |
| Implementation overview | `model_card.md` §3 |
| Boundary conditions | `risk_assessment.md` |
| Governance | This document, §Owners + `signatures_required.md` |
| Ongoing monitoring | `risk_assessment.md` §Drift monitoring |
