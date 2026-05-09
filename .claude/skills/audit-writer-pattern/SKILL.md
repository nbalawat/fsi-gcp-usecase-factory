---
name: audit-writer-pattern
description: Use the shared audit-writer Cloud Run service to record events / artifacts / state from Cloud Workflows. Auto-loads when authoring a Cloud Workflows YAML, when adding a new event_type, or when a workflow needs to write to Cloud SQL.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Audit-writer service — the shared write broker

Cloud Workflows can call HTTP services and publish to Pub/Sub but
cannot execute SQL directly. Every UC's workflow needs to write events,
artifacts, and state transitions to Cloud SQL. Rather than each UC
deploying its own helper, the bank operates ONE shared service:
`services/audit-writer/`.

## What it gives you (3 endpoints)

```
POST /event     — append a row to application_events
POST /artifact  — upsert a row in application_artifacts
POST /state     — selective UPDATE of application_state columns
GET  /health
```

Each endpoint has a Pydantic boundary; malformed payloads return 422
with details. Cloud SQL writes use a connection pool with
pool_pre_ping=True so cold-start latency is bounded.

## How a workflow uses it

```yaml
- record_pre_approval_state:
    call: http.post
    args:
      url: ${audit_writer_url + "/state"}
      auth: {type: OIDC}
      body:
        application_id: ${application_id}
        current_stage: approval
        risk_band: ${rater_result.body.risk_band}
```

```yaml
- write_return_notice:
    call: http.post
    args:
      url: ${audit_writer_url + "/artifact"}
      auth: {type: OIDC}
      body:
        application_id: ${application_id}
        artifact_type: return_notice
        author: workflow
        body: ${validation_result.body.validation}
```

## The 3 hard gates

| Gate | Why |
|---|---|
| **Selective UPDATE on /state** | Each UC writes only the columns it owns. Workflow A writing decision MUST NOT clobber the dscr_base column workflow B is also updating. The `exclude_none=True` Pydantic dump + dynamic SET clause solves this |
| **`ON CONFLICT DO UPDATE` on /artifact** | Cloud Workflows retries are normal; the same (application_id, artifact_type, revision_number) tuple lands twice. Upsert means the second write replaces the first; no FK violation, no duplicate rows |
| **Loud failure** | `write_failed` errors return 500 with the SQL error message in the body (truncated to 500 chars). The workflow's retry policy + Eventarc DLQ handle re-delivery |

## OIDC auth (every UC's workflow uses this)

Cloud Workflows automatically attaches a Google-issued ID token when
`auth: {type: OIDC}` is set. The audit-writer service validates the
token via Cloud Run's IAM check; only Workflow service accounts in
the project can call it. No API keys, no shared secrets.

## Local dev setup

```
source dev.env
export DB_PASS=$(gcloud secrets versions access latest --secret=fsi-banking-db-pass-dev)
export DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=fsi_app DB_NAME=fsi_banking
PYTHONPATH=services/audit-writer functions-framework --target=http --port=9090
```

## Real test pattern

```
LIVE_DB_TESTS=1 DB_PASS=... pytest services/audit-writer/tests
```

9 tests cover the 3 endpoints (write, read-back, idempotency, FK
validation, selective-column update, 404 path). All run against the
real dev Cloud SQL via the proxy.

## What's reusable

**Reusable (use as-is — don't fork)**:
- The entire `services/audit-writer/` service — every UC calls the
  same instance
- The Pydantic schemas (EventRequest, ArtifactRequest, StateUpdateRequest)
- The selective-update SQL pattern

**Per use case (you author)**:
- Your workflow YAML's calls into these endpoints
- Custom event_type values (your UC adds rows but the schema is shared)
- Custom artifact_type values (registered in `application_artifacts`)

## Reference

- `services/audit-writer/main.py` — the 3-endpoint service
- `services/audit-writer/tests/test_audit_writer.py` — 9 live tests
- `usecases/credit-memo-commercial/workflow.v2.yaml` — example consumer
