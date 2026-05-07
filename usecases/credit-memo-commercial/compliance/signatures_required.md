# Signatures Required — credit-memo-commercial

**Required by:** SR 11-7 §III.B (effective challenge), Bank's MRM policy
**Purpose:** record the four independent sign-offs required before this use case can be promoted to production.

No signature on this page = no production deploy. The promotion gate (`/promote credit-memo-commercial`) refuses to run if any signature is missing.

## Sign-off matrix

| Role | Person | Date | Version reviewed | Status |
|---|---|---|---|---|
| **Model Owner** (responsible party) | _pending_ | _pending_ | _pending_ | ☐ Not signed |
| **MRM Independent Validator** (must NOT have authored the model) | _pending_ | _pending_ | _pending_ | ☐ Not signed |
| **Compliance Officer** (regulatory citations + insider lending controls) | _pending_ | _pending_ | _pending_ | ☐ Not signed |
| **Business Owner** (Commercial Banking head) | _pending_ | _pending_ | _pending_ | ☐ Not signed |

Each signature attests to the items in the corresponding section below.

## Model Owner attestation

By signing, the Model Owner confirms:
- [ ] Reviewed and approved `model_card.md` content
- [ ] Reviewed and approved `risk_assessment.md` content
- [ ] Reviewed and approved `decision_rationale.md` content
- [ ] All atomic services have golden tests passing
- [ ] All agents have eval tests + adversarial tests passing
- [ ] e2e suite at `usecases/credit-memo-commercial/tests/test_e2e.py` covers all 5 scenarios
- [ ] Override mechanism is implemented and observable
- [ ] Drift monitoring is wired to Cloud Monitoring with alerting

## MRM Independent Validator attestation

By signing, the MRM Validator confirms — **as someone who did NOT author this model**:
- [ ] Reviewed all compliance pack artifacts (model_card, risk_assessment, decision_rationale, audit_trail_spec, regulatory_citations)
- [ ] Reviewed all four agent prompts (`extractor`, `rater`, `drafter`, `supervisor`)
- [ ] Validated the rubric in `prompts/rater.md` against the OCC risk classification framework
- [ ] Independently re-derived the band thresholds for at least 5 sample cases
- [ ] Reviewed the override-rate metric definition and verified it is queryable
- [ ] Reviewed the adversarial test set and judged it adequate for the model's risk tier
- [ ] Findings (if any) tracked at: _link to MRM finding log_
- [ ] No findings remain at severity HIGH or above

## Compliance Officer attestation

By signing, the Compliance Officer confirms:
- [ ] Reviewed and approved `regulatory_citations.md` — including correct distinction between 12 CFR Part 32 (legal lending limits) and 12 CFR Part 215 / OCC Part 31 (insider lending under Reg O)
- [ ] Insider-lending detection mechanism is implemented and tested (i.e. an `insider-screening` atomic service exists and is wired into the workflow before approval)
- [ ] CECL provisioning impact is documented with specific paragraph citations to ASC 326-20-30 and OCC Bulletin 2019-17 / SR 20-13 / OCC 2020-49
- [ ] Single-borrower exposure rule pinned to 12 CFR 32.3
- [ ] Fair-lending considerations addressed — disparate-impact review of NAICS-based industry scoring documented in `risk_assessment.md`
- [ ] Retention period for `audit_events` is 7 years per FFIEC / OCC 2017-43 (NOT 12 CFR Part 12, which is securities)
- [ ] Every JDM rule has a `regulatory_citation` field populated

## Business Owner attestation

By signing, the Commercial Banking head confirms:
- [ ] Reviewed and approved the use case scope and decision SLAs
- [ ] Confirmed the approval matrix in `rules/approval_matrix_commercial/v1.json` matches the bank's current credit authority delegations
- [ ] Approved the cost ceiling per memo ($3) documented in `slos.yaml`
- [ ] Approved the regulatory clock duration (5 business days) documented in `slos.yaml`
- [ ] Reviewed and approved the override-rate threshold (5%) and committed to MRM review when exceeded

## Re-signing required when

Any of the following triggers a full re-sign-off cycle:

1. Change to atomic-service algorithm (new or modified `compute_*` function)
2. Change to OCC band thresholds in `prompts/rater.md`
3. Change to approved-models list (currently `claude-opus-4-7` + `gemini-3-1-flash`)
4. Change to approval matrix in JDM rules
5. Material change to regulatory environment (new OCC bulletin, BSA rule revision, etc.)
6. Material drift detected by ongoing monitoring (override rate sustained > 5%, citation density slipping below 0.8)
7. Major version bump of `risk-rater@<v>` archetype
8. New input data source added to the use case

Lesser changes (typo fixes in narrative, peer-set boundary adjustments within tolerance) only require Model Owner re-signature.

## Audit retention

This signed page is captured in the compliance pack at promotion time, hashed (`sha256`), and the hash is recorded in `audit_events` for the promotion event. The signed PDF is stored in the regulator-readable document store with 7-year retention.
