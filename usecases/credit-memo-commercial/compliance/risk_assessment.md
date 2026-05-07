# Risk Assessment — credit-memo-commercial

**Framework:** SR 11-7
**Use Case:** credit-memo-commercial
**Assessment Date:** 2026-05-06
**Status:** Draft — pending MRM and compliance sign-off
**Next Review:** 2026-08-01 (quarterly)

---

## 1. Inherent Risk

| Risk Category | Rating | Rationale |
|---|---|---|
| Model Risk | Medium-High | The agent pipeline generates a credit recommendation that influences a credit officer's decision on a regulated lending product. Errors in financial spreading, DSCR calculation, or covenant projection could lead to incorrect risk ratings or flawed recommendations. Model drift over time may affect recommendation quality without visible signals. |
| Regulatory Risk | High | Scope covers OCC (lending limits, 12 CFR 32), Reg O (insider lending), and CECL (loss estimation inputs). A regulatory clock breach (initial decision not communicated within 5 business days) creates a direct supervisory exposure. OFAC screening failure on any borrower creates a sanctions violation risk. |
| Operational Risk | Medium | Pipeline is a multi-step fan-out workflow with 8 atomic services and 4 agents. A single service failure can stall the entire pipeline, triggering DLQ accumulation and regulatory clock exposure. Agent latency variability under high load could push past the 5-hour p99 SLO. |
| Data Risk | High | Pipeline ingests borrower financial statements that are PII-adjacent. Financial data quality varies: audited, reviewed, compiled, and management-prepared financials have materially different reliability levels. Incorrect or manipulated financials submitted by a borrower could propagate through spreading to produce a misleading risk rating. |
| Concentration Risk | Medium | Single-borrower exposure aggregation requires complete and current exposure data from the bank's loan system. Stale or incomplete exposure data could cause the single-borrower exposure rule to understate true exposure, allowing a loan that would breach OCC 12 CFR 32 limits to proceed to the credit officer queue with a passing indication. |

---

## 2. Controls

| Control | Type | Implementation | Mitigates |
|---|---|---|---|
| Human approval gate | Preventive | approval-gate@1.0 workflow fragment; all memos land in credit officer queue; no auto-approval or auto-GL-posting | Model Risk, Regulatory Risk |
| PII redaction | Preventive | redacting-logger applied before every model call; borrower financials never appear in raw form in agent prompts or logs | Data Risk, Regulatory Risk |
| Regulatory clock monitoring | Detective / Corrective | regulatory-clock@1.0 fragment monitors all open applications; P1 alarm fires at T+5 business days if no decision communicated; escalates to compliance team | Regulatory Risk |
| Cost ceiling enforcement | Preventive | $3.00 per-invocation hard limit enforced in workflow; invocations exceeding limit are rejected to DLQ with alert | Operational Risk |
| CMEK encryption at rest | Preventive | All borrower financial data encrypted with customer-managed encryption keys (CMEK) via Cloud KMS | Data Risk |
| DLQ with alerting | Detective / Corrective | dlq-on-failure@1.0 fragment captures failed invocations; P2 alert fires within 5 minutes of DLQ entry; ops team SLA for acknowledgment | Operational Risk |
| Citation density enforcement | Detective | Drafter agent enforced to citation_density_min >= 0.8; memos falling below threshold are flagged and returned to drafting stage before credit officer queue | Model Risk |
| Financial statement quality flag | Detective | Extractor agent classifies document quality (audited/reviewed/compiled/management-prepared); rater and drafter must cite quality classification and apply appropriate reliance caveat | Data Risk, Model Risk |
| OFAC screen before queue | Preventive | ofac-screen atomic service runs on every borrower before memo is released to credit officer queue; positive match blocks the memo and escalates | Regulatory Risk |
| Cross-borrower memory isolation | Preventive | Memory Bank scoped strictly to borrower_id; cross-borrower retrieval blocked by platform; architecture-auditor pre-commit check enforces boundary | Data Risk, Regulatory Risk |
| Architecture audit (pre-commit) | Preventive | /review-uc runs architecture-auditor, security-reviewer, compliance-reviewer before any commit; blocks forbidden patterns | Model Risk, Operational Risk |
| Threshold versioning | Preventive | All rule thresholds stored in BigQuery threshold tables with effective_date; no hardcoded thresholds in code; rule changes require golden test set validation | Regulatory Risk, Model Risk |

---

## 3. Residual Risk

After application of the above controls, residual risk is assessed as follows:

**Model Risk:** Medium. The human approval gate substantially mitigates the risk of a model error propagating to an actual credit decision. Residual risk remains from scenarios where a credit officer relies heavily on the memo recommendation without independent analysis, particularly under high volume conditions. Mitigation: citation density requirement ensures credit officers can trace every claim; quarterly MRM review monitors recommendation acceptance rates and override rates.

**Regulatory Risk:** Medium. Regulatory clock breach risk is materially reduced by automated monitoring and P1 alerting. OFAC and single-borrower exposure controls are preventive. Residual risk remains in edge cases where exposure data is stale at the time of the exposure-aggregator call. Mitigation: exposure-aggregator calls the bank's loan system at invocation time with a maximum-age check (stale data > 4 hours rejected).

**Operational Risk:** Low-Medium. DLQ and alerting controls reduce the risk of silent failures. The multi-service fan-out introduces correlated failure risk under infrastructure incidents. Mitigation: each atomic service has independent retry with exponential backoff; regulatory clock provides a backstop that surfaces stalls within 5 business days at worst.

**Data Risk:** Medium. Borrower-supplied financial data quality remains an inherent limitation. Compiled and management-prepared financials provide lower assurance and can be manipulated. Mitigation: extractor classifies document quality; memo must explicitly flag reliance limitations; credit officer is expected to scrutinize low-quality financial statements.

**Overall Residual Risk:** Medium. The pipeline is appropriate for production use with the described controls in place. High-value or high-complexity credits should receive supplemental credit analyst review beyond the agent-generated memo.

---

## 4. Testing Approach

### Eval Suite (Pre-Deployment)

| Test Type | Description | Pass Criteria |
|---|---|---|
| Citation density eval | Run 50 synthetic memos; measure citation_density on each | >= 95% of memos score >= 0.8 |
| Word count compliance | All memos must be <= 1500 words | 100% compliance |
| DSCR calculation accuracy | Compare dscr-calculator output to hand-calculated values on 20 test cases | MAE < 0.02 |
| Covenant projection accuracy | covenant-analyzer seasonal trough detection on 10 retail borrowers | Correct breach/pass prediction >= 90% |
| Exposure aggregation accuracy | Inject known exposure states; validate single_borrower_pct calculation | 100% accuracy |

### Adversarial Tests

| Test | Attack Vector | Expected Behavior |
|---|---|---|
| PII injection | Inject raw PII into financial document; attempt to surface in memo | redacting-logger blocks; no PII in memo or logs |
| Prompt injection | Embed adversarial instructions in financial statement text | Agent ignores; memo contains only structured financial analysis |
| Cross-borrower retrieval | Attempt memory query with mismatched borrower_id | Platform blocks; returns empty memory set; audit log entry created |
| Inflated financials | Submit artificially strong financials for stressed borrower | Peer benchmarker and industry-risk-scorer detect outlier ratios; memo flags for credit officer scrutiny |
| Regulatory clock bypass | Acknowledge DLQ item without resolving pipeline stall | Clock continues; breach alarm fires at deadline regardless of DLQ acknowledgment |

### Golden Test Set

Maintained in `tests/golden/credit-memo-commercial/`. Contains:

- 10 historical credit memo decisions with known outcomes (anonymized and de-identified)
- 5 known-decline scenarios (substandard, exposure breach, OFAC match)
- 3 known-return-for-revision scenarios (covenant structure, missing documents, concentration)
- Minimum pass rate: 85% match to historical decisions on risk band; 100% match on regulatory blocks (exposure, OFAC)

Golden test set must be re-run on every change to agents, rules, or atomic service contracts.

### Quarterly MRM Monitoring Metrics

| Metric | Target | Alert Threshold |
|---|---|---|
| Recommendation acceptance rate | Track (no target — informational) | Flag if > 95% (rubber-stamp risk) or < 50% (model drift) |
| Override rate by decline reason | Track per reason | Flag if any reason > 30% override |
| Regulatory clock breach rate | 0% | Any breach triggers immediate MRM notification |
| DSCR calculation error rate | 0% | Any calculation error triggers immediate MRM notification |
| Citation density p10 | >= 0.8 | Alert if p10 drops below 0.75 |
| Pipeline latency p99 | <= 5 hours | Alert if p99 exceeds 3 hours (early warning) |
| Cost per invocation p99 | <= $3.00 | Alert if p99 exceeds $2.50 (early warning) |

---

## 5. Compliance Attestation

This risk assessment is required before any promotion to staging or production. The following reviews must be completed and documented:

- [ ] Architecture review (architecture-auditor output attached)
- [ ] Security review (security-reviewer output attached)
- [ ] MRM review (model risk officer sign-off)
- [ ] Compliance review (OCC, Reg O, CECL compliance officer sign-off)
- [ ] Golden test set run (results attached)
- [ ] Adversarial test results (results attached)

**Risk Owner:** Commercial Lending Platform team — platform-team@bank.example.com

---

*Generated for credit-memo-commercial use case. Review quarterly or upon any material change to agents, rules, or atomic service contracts.*
