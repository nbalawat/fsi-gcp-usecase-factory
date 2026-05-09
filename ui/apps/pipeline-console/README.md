# pipeline-console

Live UI for the credit-memo-commercial pipeline. Reads `application_state` /
`application_events` / `application_artifacts` from Cloud SQL and pushes
updates to the browser via Server-Sent Events.

## Local development

The console expects a reachable Postgres instance. In dev, the recommended
path is the Cloud SQL Auth Proxy:

```bash
# 1. Start the proxy (one terminal). 5432 is the default port.
cloud-sql-proxy agentic-experiments:us-central1:fsi-banking-dev=tcp:5432 \
  --credentials-file=keys/agentic-experiments-71fb77221637.json

# 2. Start the Next.js app (another terminal).
cd ui/apps/pipeline-console
DATABASE_URL=postgres://fsi_app:CHANGEME@127.0.0.1:5432/fsi_banking \
  pnpm dev
```

Open http://localhost:3000.

### Environment variables

| Variable                    | Purpose                                                    |
|-----------------------------|------------------------------------------------------------|
| `DATABASE_URL`              | Preferred. Full Postgres connection string.                |
| `DB_HOST`, `DB_PORT`        | Local fallback (default 127.0.0.1:5432).                   |
| `DB_USER`, `DB_PASS`        | Local fallback creds.                                      |
| `DB_NAME`                   | Database name (default `fsi_banking`).                     |
| `INSTANCE_CONNECTION_NAME`  | On Cloud Run — connects via Unix socket, no proxy needed.  |

If none of these are set, the homepage and case-detail pages render with an
empty queue state, and the API routes return `503` with a helpful message.

## Live data flow

```
orchestrator / atomic services
        │ INSERT INTO application_state … / application_events …
        ▼
  Cloud SQL — fsi_banking
        │ trigger trg_app_state_changed
        ▼
  pg_notify('application_state_changed', application_id)
        │ LISTEN
        ▼
  /api/live/stream  (SSE)
        │ event: snapshot   { cases }
        │ event: state_changed { case, recent_events }
        ▼
  useLiveQueue / useLiveCase / useLiveAuditTrail   (React)
```

The trigger function and trigger live in `infra/shared/schema.sql`. After
editing `schema.sql`, re-import via:

```bash
gsutil cp infra/shared/schema.sql gs://agentic-experiments-fsi-sql-import/schema.sql
gcloud sql import sql fsi-banking-dev \
  gs://agentic-experiments-fsi-sql-import/schema.sql \
  --project=agentic-experiments --database=fsi_banking --quiet
```

## API surface

| Route                                        | Returns                                          |
|----------------------------------------------|--------------------------------------------------|
| `GET /api/cases`                             | List of cases (live).                            |
| `GET /api/cases/:id`                         | One case + full event chain + memo body.         |
| `GET /api/audit/:id`                         | Full audit trail + roll-up totals.               |
| `GET /api/audit/:id/export`                  | Regulator-shareable JSON export (download).      |
| `GET /api/live/stream`                       | SSE stream — snapshot + every state change.      |
| `GET /api/live`                              | Service-status indicator (existing route).       |

## Verifying the live SSE plumbing manually

```bash
# In another terminal, with the proxy running:
psql "postgres://fsi_app:CHANGEME@127.0.0.1:5432/fsi_banking" <<'SQL'
INSERT INTO application_state (
  application_id, borrower_id, borrower_name, naics_code, loan_amount_usd,
  current_stage, decision, risk_band, dscr_base, single_borrower_pct,
  agent_confidence, citation_density, regulatory_deadline, clock_started_at,
  stuck
) VALUES (
  gen_random_uuid(), 'BRW-LECO', 'Lincoln Electric Holdings, Inc.', '333992',
  20000000, 'approval', 'APPROVE', '1-pass', 3.82, 0.013, 0.92, 0.88,
  NOW() + INTERVAL '4 days', NOW() - INTERVAL '1 day', false
) RETURNING application_id;
SQL
```

Two browser tabs open on `/` should both show the new row appear within 1
second of the insert.
