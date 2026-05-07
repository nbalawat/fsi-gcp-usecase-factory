# Risk Assessment — credit-memo-commercial

**Framework:** SR 11-7  
**Generated from:** usecases/credit-memo-commercial/reasons.yaml  
**Last updated:** 2026-05-07  
**Status:** Draft (pending architecture + compliance review)

---

## Inherent Risk Summary

| Risk Category | Level | Basis |
|---|---|---|
| Model risk | Medium-High | LLM-based credit decisioning with human approval gate; non-deterministic prose generation |
| Regulatory risk | High | OCC/Reg O/CECL supervision; 5-business-day regulatory clock; single-borrower exposure limits |
| Operational risk | Medium | Automated multi-agent pipeline with fallback paths; DLQ and retry patterns in place |
| Technology risk | Medium | LLM hallucination potential; mitigated by atomic-service grounding and citation enforcement |
| Data risk | High | PII-adjacent borrower financials; CMEK encryption; redacting-logger required |

---

## 1. Model Risk (SR 11-7)

### Classification
This is a **vendor model used in a bank-developed application** — `claude-opus-4-7` (Anthropic) orchestrated through an Anthropic-built ADK multi-agent framework with bank-defined agent archetypes, rubrics, and output schemas. Per SR 11-7, the bank is responsible for model risk management regardless of whether the underlying model is developed internally or externally.

### Measurement
Model risk manifests in two sub-components:

**a) Extraction risk** — The extractor agent may miss or misinterpret fields in uploaded financial documents. Mitigation: extracted fields are passed to the deterministic `financial-spreader` atomic service for normalization; discrepancies between extracted and spread values are flagged.

**b) Rating and narrative risk** — The rater may assign an incorrect risk band; the drafter may generate unsupported claims. Mitigations:
- All quantitative inputs (DSCR, covenant headroom, peer percentiles, exposure percentage) come from deterministic atomic services; the model cannot fabricate them.
- Citation density enforcement (≥ 0.8): supervisor agent rejects memos that do not meet this threshold.
- Risk band is constrained to a five-label rubric (`commercial-credit-rubric-v1`) with defined criteria, not free-form text.
- Human approval gate: a credentialed credit officer reviews the memo and all supporting atomic-service outputs before any irrevocable action.

### Management
- Model performance (risk band distribution, citation density distribution, officer override rate) reviewed quarterly by Commercial Lending Platform + Model Risk Management.
- Alert fires if approve/decline/refer distribution drifts more than 10 percentage points from 65/25/10 targets.
- Any change to agent prompts, rubrics, or output schemas requires `/fsi-prompt-update` workflow and architecture review sign-off.

---

## 2. Regulatory Risk

### OCC Credit Risk Management
**Risk:** Memo does not meet OCC examination standards; examiner finds inadequate credit analysis documentation.  
**Control:** Memo format enforced via `credit-memo-occ-v1` template (section structure, citation density, word limit). Architecture-auditor pre-commit hook blocks non-compliant memo templates.  
**Residual risk:** Low — format compliance is automated; content quality reviewed by credit officer.

### SR 11-7 Model Risk Management
**Risk:** Model risk not adequately managed; LLM outputs used for credit decisions without appropriate oversight.  
**Control:** This risk assessment, model card, and audit trail spec constitute the MRM documentation package. Ongoing monitoring program (quarterly review, weekly distribution check, REASONS drift check) provides SR 11-7 §II.C compliance.  
**Residual risk:** Medium — dependent on quarterly review cadence being maintained.

### Reg O (12 CFR Part 215) — Insider Lending
**Risk:** Single-borrower exposure limit breach; insider lending limit exceeded without detection.  
**Control:** `single_borrower_exposure@1.0` rule evaluated before agent pipeline runs. The rule computes headroom against Tier 1 capital using outputs from `exposure-aggregator`. Pipeline halts and routes to DLQ on any limit breach. No memo is drafted and no approval queue entry is created.  
**Residual risk:** Low — hard gate enforced by rules engine before any LLM processing.

### CECL (ASC 326)
**Risk:** DSCR outputs and risk ratings used as CECL model inputs are inaccurate; credit loss provisions are misstated.  
**Control:** `dscr-calculator` and `industry-risk-scorer` are deterministic atomic services with unit tests and golden test sets. Risk band assignments are validated monthly against Finance's CECL model inputs.  
**Residual risk:** Medium — dependent on monthly CECL feed validation.

### Regulatory Clock
**Risk:** Credit decision not communicated within 5 business days of complete application.  
**Control:** `regulatory-clock@1.0` workflow fragment publishes countdown events and fires a Cloud Alerting alarm at the 5-business-day boundary. Compliance officer receives alert; escalation path defined in runbook.  
**Residual risk:** Low — automated clock with monitored alarm.

---

## 3. Operational Risk

### Pipeline Failure
**Risk:** Atomic service failure, agent timeout, or workflow error results in a stalled memo.  
**Control:** `agent-call-with-retry@1.0` fragment handles transient failures. `dlq-on-failure@1.0` routes unrecoverable failures to `credit-memo-commercial.dlq` with full context. Regulatory clock continues to count down; DLQ entries trigger an alert.  
**Residual risk:** Low — DLQ + regulatory clock alarm ensures no silent failures.

### GL Posting Sequencing
**Risk:** GL posting fires before credit officer approval; irrevocable financial entry made without authorization.  
**Control:** `approval-gate@1.0` fragment implements a Cloud Workflows callback pattern. The `gl-posting` sink is downstream of the callback; it cannot execute until the credit officer's approval action returns the callback token. This is enforced at the workflow layer, not by application code.  
**Residual risk:** Negligible — architectural constraint, not a configurable parameter.

### Approval Queue Access
**Risk:** Unauthorized user approves or declines a credit memo.  
**Control:** Approval queue access restricted to the `credit-officer` IAM role. All approval actions are logged to Cloud Logging and BigQuery `audit.gl_posting_events` with the actor's identity.  
**Residual risk:** Low — IAM enforcement with full audit trail.

---

## 4. Technology Risk

### LLM Non-determinism and Hallucination
**Risk:** LLM generates plausible-sounding but incorrect financial claims in memo prose.  
**Controls:**
- All financial figures sourced exclusively from atomic-service outputs passed as structured context to the drafter agent; model cannot invent numbers.
- Citation density enforcement (≥ 0.8): supervisor rejects drafts that fail threshold.
- Memo word limit (≤ 1,500 words) reduces surface area for unsupported elaboration.
- Credit officer reviews atomic-service output summaries alongside memo prose; discrepancies are visible.  
**Residual risk:** Low-Medium — grounding and citation controls significantly limit hallucination surface; human review is the final barrier.

### Model Versioning and Drift
**Risk:** Anthropic updates `claude-opus-4-7` behavior; memo quality or risk band distribution shifts without notice.  
**Control:** Weekly distribution monitoring alerts on drift. Quarterly performance reviews compare current outputs to baseline.  
**Residual risk:** Medium — model provider versioning is outside bank control; monitoring is the primary mitigant.

### Memory Bank Scope Leakage
**Risk:** Borrower A's financial context is retrieved when processing Borrower B's application.  
**Control:** Memory Bank scope enforced at `borrower_id` level by ADK framework. Cross-borrower retrieval is architecturally blocked. Architecture-auditor hook flags any code attempting cross-scope retrieval.  
**Residual risk:** Low — enforced by framework and automated audit.

---

## 5. Data Risk

### PII / Sensitive Financial Data
**Risk:** Borrower financial data (revenue, debt schedule, insider relationships) exposed in logs, model prompts, or audit tables.  
**Controls:**
- Redacting-logger applied before all model calls; sensitive field names enumerated in redaction configuration.
- No PII in agent prompts — structural contract enforced by architecture-auditor.
- BigQuery audit tables store event metadata and `context_id` correlation keys, not raw financial data.
- GCS memo artifacts encrypted at rest with CMEK (Customer-Managed Encryption Keys).  
**Residual risk:** Low — layered controls (redaction + CMEK + audit-only tables).

### Data Lineage
**Risk:** It is not possible to reconstruct what inputs produced a given memo outcome.  
**Control:** `context_id` is the correlation key propagated across all service calls, agent invocations, rule evaluations, and the approval action. Full lineage reconstruction is possible from BigQuery audit tables for any `context_id`. See `audit_trail_spec.md` for schema details.  
**Residual risk:** Low — complete lineage by design.

---

## Controls Summary

| Control | Implementation |
|---|---|
| Human approval gate | Cloud Workflows `approval-gate@1.0` callback before GL posting |
| PII redaction | `redacting-logger` on all agent prompts before model calls |
| Regulatory clock | `regulatory-clock@1.0` workflow fragment; Cloud Alerting alarm |
| Single-borrower exposure hard gate | `single_borrower_exposure@1.0` rule evaluated pre-pipeline |
| Citation density enforcement | Supervisor agent validates ≥ 0.8 before routing to approval queue |
| Cost ceiling | $3.00/invocation enforced via GCP budget alert |
| CMEK encryption | All GCS memo artifacts and BigQuery tables encrypted at rest |
| Memory Bank scope enforcement | ADK framework `borrower_id` scope; architecture-auditor hook |
| Approval queue IAM | `credit-officer` role restriction; Cloud Logging audit |
| DLQ + retry | `dlq-on-failure@1.0` + `agent-call-with-retry@1.0` for operational resilience |
| Distribution monitoring | Weekly Cloud Monitoring alert on approve/decline/refer drift |
| Quarterly MRM review | Commercial Lending Platform + Model Risk Management |

---

## Residual Risk

**Overall residual risk rating: Medium.**

The use case presents elevated inherent risk due to LLM-based credit decisioning under OCC supervision. The control set — particularly the human approval gate, deterministic atomic-service grounding, citation enforcement, and rules-layer regulatory thresholds — reduces residual risk to an acceptable level for a supervised lending pipeline. Continued quarterly model performance review and monthly CECL feed validation are required to maintain this rating.

**Acceptable for:** Credit officer review with credit officer override authority. The credit officer is not bound by the LLM risk rating and may override with documented reason.

---

*Generated from `usecases/credit-memo-commercial/reasons.yaml`. Update reasons.yaml and regenerate via `/fsi-build-parallel` to keep current.*
