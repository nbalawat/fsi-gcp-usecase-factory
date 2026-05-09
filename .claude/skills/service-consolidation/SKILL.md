---
name: service-consolidation
description: How to merge 2+ atomic services into 1 with byte-equivalent parity tests. Auto-loads when consolidating Cloud Run services in any use case, when seeing premature decomposition (services that always run together), or when reducing operational surface area.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*)
---

# Service consolidation — the factory pattern

The bank's first impulse is to decompose every operation into its own
atomic service. That's the right default; pure compute units are easy
to reason about, deploy, scale. But the decomposition has a cost:
- 2× cold starts when both services run on every case
- 2× Cloud Run revision management
- 2× IAM grants, 2× threshold-table reads on the request path

When two services satisfy ALL of these, consolidate them:
1. Both run on EVERY case in the workflow
2. Both consume similar inputs (or one's output feeds directly into the
   other)
3. Both share the same Cloud SQL tables / reference data
4. Splitting them across teams isn't a real organizational constraint

## What you build

The consolidation is mechanical. Don't rewrite — IMPORT the legacy
compute fns from the new service and route on path:

```
services/atomic/<new-service>/
  main.py                      # router that dispatches by request.path
  Dockerfile                   # COPYs both legacy dirs
  pyproject.toml
  manifest.json                # records `consolidates: [...]`
  tests/test_parity_<x>.py     # byte-equal parity vs each legacy
```

`main.py` shape:

```python
import importlib.util
_legacy_a = _load_legacy("dscr-calculator")
_legacy_b = _load_legacy("covenant-analyzer")

@functions_framework.http
def http(request):
    path = (request.path or "/").rstrip("/")
    if path == "/dscr":          return _dispatch(_legacy_a, request)
    if path == "/covenant_test": return _dispatch(_legacy_b, request)
    if path == "/health":        return _health()
    return ({"error": "not_found"}, 404)
```

`_dispatch` calls `legacy.process(payload)` — the SAME function the
legacy service exposed. Output is byte-equivalent by construction.

## The 4 hard gates

| Gate | Why |
|---|---|
| **Import legacy `process()` — DON'T reimplement** | Reimplementation has zero benefit and infinite drift surface. The point of consolidation is operational, not behavioral |
| **Byte-equal parity test on golden fixtures** | `legacy.process(payload) == new._a.process(payload)` (modulo `_meta`). Test runs against real Cloud SQL via `DATABASE_URL`; it's part of the cutover gate (no parity → no cutover) |
| **`_meta.service` tag** | New service tags responses with its own service_name in `_meta` so audit logs distinguish the two paths during the parity period |
| **Dockerfile COPYs both legacy dirs** | Build context must be `services/atomic/`; the new service's container ships the legacy code unchanged |

## Real test pattern

```python
def test_smoke_payload_byte_equal():
    legacy = _load("dscr-calculator")
    new = _load("loan-serviceability")
    payload = json.load(open("dscr-calculator/tests/smoke_payload.json"))
    legacy_out = legacy.process(payload)
    new_out = new._dscr.process(payload)
    a = {k: v for k, v in legacy_out.items() if k != "_meta"}
    b = {k: v for k, v in new_out.items() if k != "_meta"}
    assert a == b
```

Track B in credit-memo-commercial proved this with 17 passing tests
across 3 consolidations (8 services → 5, all byte-equal).

## What's reusable

The pattern itself is the asset. `services/atomic/loan-serviceability/`,
`peer-and-industry-context/`, and `borrower-network/` are the reference
implementations.

## When NOT to consolidate

- Services owned by different teams (deploy cadence diverges)
- Services that run on different fractions of cases (one runs always,
  the other on 5% — cold starts don't dominate)
- Services with different scaling profiles (one bursts to 1000
  concurrent, the other is a slow-and-steady)

## Reference

- `services/atomic/loan-serviceability/main.py` — 153 lines, dispatches
  to dscr-calculator + covenant-analyzer
- `services/atomic/loan-serviceability/tests/test_parity_loan.py` —
  parity tests
- `docs/methodology/cutover-runbook-credit-memo-v2.md` — the 7-day
  parity-period playbook the bank uses to gate cutover
