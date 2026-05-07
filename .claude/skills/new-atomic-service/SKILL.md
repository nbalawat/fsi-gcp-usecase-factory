---
name: new-atomic-service
description: Scaffold a new atomic service → main.py + manifest + Dockerfile + Procfile + tests + Terraform. Output to services/atomic/<name>/. Idempotent.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, mkdir:*, pytest:*, ruff:*, mypy:*)
---

You are scaffolding a new atomic service. Atomic services are stateless, perform real financial computation, and read policy thresholds from Cloud SQL.

## Step 1 — Gather context

Ask the user:

1. **Service name** — kebab-case, action-oriented (`dscr-calculator`, `peer-benchmarker`).
2. **One-line description** — what it computes.
3. **Inputs** — list of field names (snake_case).
4. **Outputs** — list of field names.
5. **Compute logic** — one paragraph, real algorithm (DSCR formula, percentile math, covenant projection, etc.).
6. **Policy thresholds** — what configurable cutoffs need a Cloud SQL row?
7. **Data classification** — `confidential` (financial / PII-adjacent) or `internal` (technical metadata).

## Step 2 — Verify reuse

`ls services/atomic/`. If a similar service exists, ask:
(a) Reuse — same service serves multiple use cases.
(b) Generalize — extend the existing service to handle the new shape.
(c) Create new — explain why distinct.

The factory's reuse target is ≥60% of services. Don't fork lightly.

## Step 3 — Verify the service is truly atomic

A new atomic service must:
- Have NO HTTP calls to other atomic services (composition lives in the workflow).
- Be stateless (no in-memory state between requests).
- Read policy thresholds from Cloud SQL via `_load_thresholds()`, never hardcoded.
- Audit-write to Cloud SQL `audit_events` in a try/finally.

If the user wants a service that calls another service — refuse. Refer them to `workflow-design`.

## Step 4 — Scaffold from template

Read `references/template_scaffold.md`. It contains:

- `main.py` template — process(), _get_engine(), _load_thresholds(), _write_audit(), main()
- `manifest.json` template — name, version, inputs, outputs, data_classification
- `Dockerfile` and `pyproject.toml` (with sqlalchemy + cloud-sql-python-connector deps)
- `Procfile` — `web: functions-framework --target=main --port=$PORT`

Fill in placeholders from Step 1. The thresholds the service loads must match Step 1's policy thresholds.

## Step 5 — Generate tests via subagent

Delegate to the `test-author` subagent. Output: `services/atomic/<name>/tests/test_main.py` with at least 10 cases covering:
- Pure-function unit tests (no DB).
- Threshold-loaded cases (use the SQLite-in-tmp pattern from existing tests).
- Audit-row insertion verified by querying the test DB.
- Boundary cases at threshold cutoffs.

Plus `tests/smoke_payload.json` for the deployer's smoke test.

## Step 6 — Generate Terraform via subagent

Delegate to `terraform-author`. Output: `services/atomic/<name>/service.tf` calling the `atomic_service` module from `infra/modules/`. Includes IAM (cloudsql.client + secretAccessor), private VPC ingress, OTel.

## Step 7 — Validate

```
ruff check services/atomic/<name>/
mypy --strict services/atomic/<name>/main.py
(cd services/atomic/<name> && pytest tests/ -q)
```

Plus the `service-validator` subagent — it's the Layer 1 join-point gate.

## Step 8 — Architecture audit

Run the `architecture-auditor` subagent. It checks: no atomic-to-atomic calls, no hardcoded thresholds, redacting_logger usage, OTel imports, audit_events writes.

## Step 9 — Optional dry-run deploy

```
gcloud run deploy fsi-atomic-<name> --source=services/atomic/<name>/ \
  --no-traffic --tag=preview-<name>-<timestamp>
```

Verify the build succeeds; teardown immediately if not promoting.

## Step 10 — Report

```
DONE services/atomic/<name>/
  Inputs:        {N}
  Outputs:       {N}
  Tests:         {N} pass
  Validation:    PASS
  Classification: {confidential | internal}
  Cloud SQL:     thresholds={list} ; audit=enabled
```

## Anti-patterns to refuse

- Hardcoded threshold numeric constants at module scope.
- HTTP calls to other atomic services (composition belongs in the workflow).
- `print()` or stdlib `logging` — use `redacting_logger`.
- Missing audit_events write or audit outside try/finally.
- Models / external API calls from an atomic service (no LLM, no third-party HTTP).
- `data_classification: internal` for services that handle borrower / loan / financial data.
