---
name: validation-gate
description: Return-for-revision gate pattern with Python+TS parity. Auto-loads when authoring a workflow stage that decides PROCEED vs RETURN, a return_notice artifact, or any UI panel that renders a "missing items" checklist. Codifies the pattern from credit-memo-commercial Track E.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*)
---

# Validation gate — the factory pattern

After document extraction, before atomic services run, every UC needs a
deterministic check: are the submitted documents complete enough to
underwrite/decide/process? If not, route to the applicant with an
actionable checklist. This skill codifies the Python+TypeScript parity
pattern from credit-memo-commercial Track E.

## What you build

```
usecases/<uc>/validation/__init__.py             # exports
usecases/<uc>/validation/gate.py                 # Python gate (workflow consumer)
ui/apps/<console>/app/api/applications/[id]/validate/route.ts  # TS gate (UI consumer)
```

Both gates consume the SAME `document_requirements.json`; they MUST
produce identical decisions on the same input.

## Why two gates?

- **Python gate**: runs server-side from Cloud Workflows (which calls
  Cloud Run services + can't easily call Next.js routes). Single source
  of truth for the decision the workflow branches on.
- **TypeScript gate**: runs in the Next.js route handler so the UI can
  re-validate at any time without bouncing through Cloud Run. Used by
  the underwriter's "what's holding this up?" checker + by the RM
  during draft submission.

The two **MUST** stay in lockstep. The parity test asserts this on
real DB rows (5 scenarios × both gates → identical decisions).

## The 4 hard gates

| Gate | Why |
|---|---|
| **Pydantic at the boundary** | `ValidationInput` + `MissingItem` + `ValidationResult` — every input/output validates BEFORE business logic runs. Malformed payloads fail at the boundary, not 5 steps downstream |
| **`return_notice` artifact** | When decision==RETURN_FOR_REVISION, the workflow writes the result verbatim into `application_artifacts(artifact_type='return_notice')`. The UI renders this without re-running the gate; the audit trail keeps the structured rationale |
| **Banker-readable `applicant_message`** | Each `MissingItem` carries a 1-paragraph applicant_message + an optional regulation citation. The UI renders these as the actionable checklist; no UI prose generation needed |
| **Python/TS parity test** | A real-DB integration test that runs BOTH gates and asserts identical (decision, missing_item codes) on a parametrized scenario set. CI gate before deploy |

## Decision rules (codify per use case)

For credit-memo-commercial these are the four reasons to return:
1. **APPLICATION_INCOMPLETE** — submitted doc-types don't satisfy the
   loan-amount tier
2. **CRITICAL_FIELDS_MISSING** — extracted doc lacks a required field
3. **EXTRACTION_FAILED** — vendor returned 4xx / 5xx for a required doc
4. **PENDING / EXTRACTING** — gate ran too early (programming error)

For your use case the categories will differ (mortgage: missing W-2,
expired appraisal, ID mismatch; KYC: address verification gap, OFAC
hit, source-of-funds undocumented). Codify them as Pydantic Literal
enums.

## Real test pattern

```python
@pytest.mark.parametrize("scenario", [
    (5_000_000, [("10-K", "extracted", [], None)]),                # PROCEED
    (5_000_000, [("10-K", "extracted", ["income_statement.revenue"], None)]),
    (25_000_000, [("10-K", "extracted", [], None)]),               # missing AR_aging
    (25_000_000, [("10-K", "failed", [], "landing_ai_parse_http_422"),
                  ("AR_aging", "extracted", [], None)]),
    (1_000_000, [("AR_aging", "extracted", [], None)]),            # baseline
])
def test_python_and_ts_gates_agree(db_engine, scenario):
    # Seed real DB rows
    # Run Python gate → py_result
    # Run TS gate via http → ts_result
    # Assert decision matches AND missing_item codes match exactly
```

5 scenarios × both gates → 5 parity tests; expect zero drift over time.

## What's reusable

**Reusable (use as-is — don't fork)**:
- The `MissingItem` shape — every UC's gate produces the same shape so
  the UI's `ReturnedApplicationPanel` renders all of them identically
- The `return_notice` artifact_type in `application_artifacts` —
  one schema across all UCs
- The Python/TS parity test pattern (parametrized scenarios)

**Per use case (you author)**:
- `usecases/<uc>/validation/gate.py` (Python)
- `ui/apps/<console>/app/api/applications/[id]/validate/route.ts` (TS)
- The `MissingItem.code` enum specific to your domain
- The decision-rule tier table (loan-amount-tiered for credit-memo;
  collateral-conditional + 12-month-recency for mortgage; etc.)

## Reference

- `usecases/credit-memo-commercial/validation/gate.py` (276 lines)
- `usecases/credit-memo-commercial/tests/test_validation_gate.py` —
  25 tests passing (19 deterministic + 1 live + 5 Python/TS parity)
- `ui/apps/pipeline-console/app/api/applications/[id]/validate/route.ts`
- `usecases/credit-memo-commercial/ui/components/returned-application/`
