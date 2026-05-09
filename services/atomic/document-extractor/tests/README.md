# document-extractor — production-grade test suite

Two layers, both required to land changes:

## Layer 1 — Deterministic (always green, no API cost, runs in CI)

```
PYTHONPATH=. pytest tests/test_schemas.py tests/test_requirements_validation.py -q
```

- Pydantic boundary validation (every field constraint, every refusal)
- Requirements-loader logic (missing-field detection edge cases)

Coverage: 31 tests, < 1 second.

## Layer 2 — Live integration (real Landing AI + real Cloud SQL)

```
# 1. Get keys
export LANDING_AI_API_KEY="<your key>"
export DB_PASS=$(gcloud secrets versions access latest --secret="fsi-banking-db-pass-dev")
export DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=fsi_app DB_NAME=fsi_banking

# 2. Make sure Cloud SQL proxy is running on 127.0.0.1:5432

# 3. Pull real PDF fixtures (one time, ~3MB)
bash tests/fixtures/download.sh

# 4. Run everything except the $0.55 hero (full 152-page Berkshire)
LIVE_VENDOR_TESTS=1 LIVE_DB_TESTS=1 ALLOW_AUDIT_WRITE_FROM_TESTS=1 \
  PYTHONPATH=. pytest tests/ \
  --deselect tests/test_live_landing_ai.py::TestBerkshireAnnualReportFullExtraction
```

Coverage: 24 live tests on top of the 31 deterministic = 55 total.
Cost: ~$0.23 per full run. Runtime: ~3:30.

## The hero tests (run before promoting to staging)

```
LIVE_VENDOR_TESTS=1 LANDING_AI_API_KEY=... \
  PYTHONPATH=. pytest tests/test_live_landing_ai.py::TestBerkshireAnnualReportFullExtraction -v -s
```

Cost: ~$0.55. Runtime: ~5–10 minutes. Two tests:
- Full 152-page parse + extract with assertions on Berkshire's known
  public values (revenue/net-income/equity at billion-dollar scale)
- Idempotency — two real calls produce structurally equivalent results

## What each live file proves

| File | Quality gate it verifies |
|---|---|
| `test_live_landing_ai.py::TestBerkshireAnnualReportFullExtraction` | Hero — real 10-K end-to-end (page-count, citations, cost ceiling, latency, idempotency) |
| `test_live_landing_ai.py::TestEdgeCases` | Doc-type-mismatch routing, corrupted-PDF error surfacing, dispatcher always-200 |
| `test_live_round_trip.py` | Citation chain — page 1-indexing, bbox normalization, chunk resolution, dotted field paths, real-data sanity |
| `test_live_cost_and_latency.py` | Cost budget vs manifest, latency p99, vendor-model present, warnings well-formed |
| `test_live_audit_completeness.py` | Real Cloud SQL writes — extraction events + failure events + full E2E pipeline |

## When to bump the budgets in `manifest.json`

The `production_gates.measurements` block records observed cost + latency
on representative fixtures. The cost/latency tests assert these stay
within their respective budgets (`cost_target_per_doc_usd`, etc.).

If Landing AI changes its model and you observe a real regression:
1. Confirm via `tests/test_live_cost_and_latency.py` — it prints the
   measurement at the end of every run.
2. Update `production_gates.measurements` AND the budgets if the new
   number is the new normal.
3. Document the bump reason in the commit.

Do NOT bump budgets to make a failing test pass without an explicit
"this is the new normal" decision.
