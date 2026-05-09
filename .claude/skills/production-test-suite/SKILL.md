---
name: production-test-suite
description: The 10 hard test gates every Cloud Run service / agent / route MUST pass before its first deploy. Auto-loads when authoring a service, an agent, or a route handler. Codifies the production-grade discipline from credit-memo-commercial Tracks A-D.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Production-grade test suite — the 10 hard gates

A component that doesn't pass all 10 gates does NOT ship. The legacy
13-agent + 8-service stack failed several of these on its first deploy
attempt; the new 5+5 stack passes all of them.

## The 10 gates

| # | Gate | What it verifies |
|---|---|---|
| 1 | **Pydantic at every boundary** | Every input/output payload validates BEFORE business logic runs. Malformed payloads fail at the boundary, not 5 steps downstream |
| 2 | **Real-data golden fixtures (good + edge + bad)** | ≥3 fixtures: known-good (real Berkshire 10-K), known-edge (deficient chairman letter), known-bad (truncated PDF). NEVER JSON masquerading as a test |
| 3 | **Cost ceiling assertion** | Test fails if per-call cost exceeds budget. Catches silent regressions when a vendor's model changes |
| 4 | **Latency p99 budget** | Test fails if p99 over N runs exceeds budget. Guards against silent slowdowns |
| 5 | **Error injection** | Vendor 4xx/5xx, timeout, malformed schema — each produces a structured failure event, NOT a crash |
| 6 | **Idempotency** | Same input twice produces structurally equivalent output (within model temperature variance) |
| 7 | **Audit-event completeness** | Every component emits ≥1 application_events row per invocation; every regulator-visible field is non-null |
| 8 | **Round-trip / citation chain** | Extracted-field → citation → chunk → bbox → page → source PDF page works end-to-end |
| 9 | **Local end-to-end smoke** | One script (`smoke_e2e.sh`) runs the full pipeline against deployed dev services; asserts all stages green, no glitch patterns |
| 10 | **No silent stubs** | If a vendor / service / agent is unavailable, the failure is LOUD. The smoke FAILS with `stubs: 0` requirement (Rule 3) |

## What this looks like in code

Reference: `services/atomic/document-extractor/tests/`

```
tests/
  conftest.py                       # PYTEST_CURRENT_TEST guard, fixtures
  test_schemas.py                   # gate 1 — Pydantic boundary (32 tests)
  test_requirements_validation.py   # logic tests (15)
  test_live_landing_ai.py           # gates 2, 5, 10 — real Landing AI calls
  test_live_round_trip.py           # gate 8 — citation chain
  test_live_cost_and_latency.py     # gates 3, 4
  test_live_audit_completeness.py   # gate 7 — real Cloud SQL writes
  fixtures/
    download.sh                     # pulls Berkshire 2023 10-K (real public PDF)
    smoke_10pages.pdf               # 104KB
    small_valid_financial.pdf       # 451KB, 30pp
    deficient_chairman_letter.pdf   # 13pp, no financial tables
    truncated_corrupted.pdf         # 4KB, fails parse
```

55 tests verified passing on real Landing AI + real Cloud SQL.

## Live-test gating pattern

Live tests must be opt-in to avoid burning budget in CI:

```python
LIVE_ENABLED = (
    os.environ.get("LIVE_VENDOR_TESTS") == "1"
    and os.environ.get("LANDING_AI_API_KEY")
)

pytestmark = pytest.mark.skipif(
    not LIVE_ENABLED,
    reason="Set LIVE_VENDOR_TESTS=1 + LANDING_AI_API_KEY to run live tests",
)
```

Run modes:
- **PR / CI default**: deterministic only (~30 seconds, $0)
- **Pre-deploy**: `LIVE_VENDOR_TESTS=1 LIVE_DB_TESTS=1 ALLOW_AUDIT_WRITE_FROM_TESTS=1 pytest ...`
  (~3:30, ~$0.23 per full pass on credit-memo-commercial)
- **Hero / pre-promote**: include the full 152-page Berkshire test
  (~$0.55, ~5–10 min)

## Module-scoped fixtures = 1 LLM call per file

```python
@pytest.fixture(scope="module")
def smoke_extraction():
    vendor = LandingAIVendor()
    return vendor.extract(...)  # ONE call, shared across N tests in this file
```

8 round-trip tests on the same extraction = $0.04, not $0.32.

## Real measurements pinned in the manifest

```json
"production_gates": {
  "cost_target_per_doc_usd": 0.50,
  "cost_budget_per_call_usd": 1.00,
  "latency_p99_ms": 300000,
  "measurements": {
    "small_valid_financial_pdf_30pp": {
      "elapsed_ms": 64318,
      "estimated_cost_usd": 0.115,
      "citations": 56,
      "vendor_model": "extract-20260314"
    }
  }
}
```

The cost+latency tests assert against `production_gates.*` in the
manifest. To bump a budget, you update the manifest AND document the
reason in the commit. No silent budget bumps.

## What's reusable

**Reusable (use as-is — don't fork)**:
- The 10-gate checklist
- The opt-in live-test gating pattern
- The module-scoped fixture pattern
- The "measurements" block in manifest.json
- The `test_live_audit_completeness.py` Cloud-SQL-write pattern (with
  `ALLOW_AUDIT_WRITE_FROM_TESTS=1` escape hatch — read the
  `services/atomic/document-extractor/audit.py` source for the pattern)

**Per use case (you author)**:
- The fixtures for your domain (real PDFs, real example payloads)
- The cost + latency budgets specific to your vendor mix
- The known-value assertions (e.g. Berkshire net_income ≈ $96B)

## Reference

- `services/atomic/document-extractor/tests/README.md`
- `services/atomic/document-extractor/manifest.json` — measurements
- `services/audit-writer/tests/test_audit_writer.py` — 9 live tests
- `usecases/credit-memo-commercial/tests/test_validation_gate.py` —
  25 tests including 5 Python/TS parity
