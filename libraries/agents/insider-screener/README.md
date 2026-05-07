# insider-screener

Detects Reg O insider status. **Required** for any commercial credit use case — Reg O requires affirmative detection, not passive routing.

## Why this archetype exists

The credit-memo-commercial pilot's compliance review surfaced a BLOCKER: there was no mechanism actually detecting whether a borrower was an insider. The pipeline assumed the approval-matrix rule would catch them, but Reg O requires **affirmative detection** with cited evidence. This archetype closes that gap.

## Regulatory citation

- 12 CFR Part 215 (Federal Reserve Regulation O) — applies to member banks
- 12 CFR Part 31 (OCC) — equivalent for national banks
- **NOT** 12 CFR Part 32 — that's the legal lending limit (LLL), distinct from Reg O

(The `policies/encryption.rego` and gatekeeper fixtures both lock in this distinction so it doesn't get conflated again.)

## When to use

- Commercial loan origination (credit memo)
- Renewals and modifications of existing commercial credit
- Any extension of credit where the applicant or guarantor could plausibly be a bank insider

## Instantiation example

```yaml
agents:
  - role: insider_screener
    archetype_ref: insider-screener@1.0
    params:
      input_schema: usecases/credit-memo-commercial/schemas/borrower_bundle.py
      tools:
        - officer-director-registry
        - principal-shareholder-lookup
        - related-interests-graph
        - hris-employee-lookup
      insider_definition_doc: policies/reg-o-insider-definition-2024-q4.md
      confidence_floor: 0.90
```

## Wiring with rules

The screener output feeds the `approval_matrix_commercial` rule:

```yaml
rules_result.approval_matrix.inputs:
  insider_flag: <screener.insider_status == "insider">
  insider_type: <screener.insider_type>
```

If `insider_flag = true`, the matrix routes to the board approval path and applies the Reg O 15% individual limit (or 25% aggregate) instead of the general LLL.
