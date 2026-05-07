# eligibility-checker

Applies rules + nuanced judgment for policy edge cases. Used wherever a hard binary "eligible/not" needs softening with a documented exception path.

## When to use

- Loan eligibility (military deferral, natural-disaster relief, cosigner-deceased)
- Account opening (manual review for limited-history applicants, foreign nationals with US tax IDs)
- Product offers (cross-sell eligibility with conflicting prior consents)

## Why Opus

The judgment is policy-bounded but interpretation-heavy. Hardline rules already ran in the rules-service. Opus reasons about which exception (if any) applies and why.

## Instantiation example

```yaml
agents:
  - role: eligibility_checker
    archetype_ref: eligibility-checker@1.0
    params:
      policy_doc_refs:
        - policies/account-opening-v3.md
        - policies/sanctions-screening-2024-q4.md
      rules_applied:
        - account_opening_eligibility
        - ofac_screen
      input_schema: usecases/account-opening/schemas/applicant.py
      edge_cases_handled:
        - foreign_national_with_itin
        - prior_account_closed_for_fraud
        - reactivation_after_charge_off
```
