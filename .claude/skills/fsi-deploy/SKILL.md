---
name: fsi-deploy
description: Deploy a use case to GCP. Reads REASONS canvas → parallel atomic-service deploys → smoke tests → handler → Pub/Sub wiring → patches manifest endpoints with Cloud Run URLs. Reusable across use cases and dev/staging/prod.
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(gcloud:*, bash:*, ls:*, cat:*, python3:*, jq:*)
---

You are the deploy orchestrator. Read the REASONS canvas to discover what to deploy, then drive the full deploy sequence with validation at each step.

## Inputs

- `$1` — use case ID (required), e.g. `credit-memo-commercial`
- `--env=<dev|staging|prod>` — target environment (default: dev)
- `--force` — re-deploy even if `.fsi-state/<service>.url` exists

## Step 1 — Resolve environment config

Read `dev.env`, `staging.env`, or `prod.env` (whichever the `--env` flag selects). Fail-closed: required variables are `GCP_PROJECT`, `GCP_REGION`, `GOOGLE_APPLICATION_CREDENTIALS`, `INSTANCE_CONNECTION_NAME`, `DB_USER`, `DB_NAME`, `DB_PASS_SECRET`, `VPC_CONNECTOR`, `INGRESS`.

Confirm the active service-account identity: `gcloud auth print-identity-token` must succeed.

## Step 2 — Parse REASONS canvas for deployable operations

From `usecases/{uc}/reasons.yaml`, collect every Operation of kind `atomic-service`, `handler`, `sink`, `agent`, `workflow`. Their `path` fields are what gets deployed.

## Step 3 — Fan out atomic service deploys (parallel)

Read `references/deploy_steps.md` for the per-service flow:
- `gcloud run deploy --source=...` with auth-only ingress
- Wait for healthy
- Smoke-test via `scripts/smoke_test_service.sh`
- Record the resolved URL into `.fsi-state/<service>.url`

Use `bash` `&` + `wait` to fan-out. Cap at 8 in flight to avoid Cloud Build quota bursts.

## Step 4 — Validate deployed services (parallel smoke tests)

For each service in the fan-out group, run `scripts/smoke_test_service.sh <name> --gcp` against the deployed URL. Failures roll back the revision and stop the deploy.

## Step 5 — Patch manifest.json endpoints with real URLs

For each service, edit `services/atomic/<name>/manifest.json` (or `usecases/<uc>/sinks/<name>/manifest.json`) and set `endpoint` to the resolved Cloud Run URL.

These manifest.json files are read by the agent runtime + workflow at evaluation time, so they must reflect the actual deployed URLs.

## Step 6 — Deploy handler

`gcloud run deploy fsi-handler-{uc} --source=usecases/{uc}/handler/`. Same Pattern as atomic services but with `--ingress=internal-and-cloud-load-balancing` so Pub/Sub push can reach it.

## Step 7 — Wire Pub/Sub push subscription

Create or update the push subscription on the trigger topic, pointing at the handler URL with OIDC auth. Configure DLQ on max-retry exceeded.

## Step 8 — Deploy workflow + sinks

`gcloud workflows deploy {uc}-workflow --source=usecases/{uc}/workflow.yaml`. Then deploy each sink the same way as atomic services.

## Step 9 — Report

```
DEPLOYED {uc} → {env}
  Atomic services: {N} (URLs in .fsi-state/)
  Handler:         {url}
  Workflow:        {workflow_id}
  Sinks:           {N}
  Subscriptions:   {N}
  Smoke:           {N}/{N} passed
  Total elapsed:   {minutes}
```

## Discipline rules

- Never deploy to prod without `/promote` having returned READY.
- Never use `--allow-unauthenticated` — every service is OIDC-gated.
- Never embed `DB_PASS` as a plaintext env var — always `--set-secrets`.
- Always set `--ingress=internal` for atomic services in prod; `internal-and-cloud-load-balancing` for handlers.
- Always patch `manifest.json` `endpoint` after deploy so the workflow finds the right URL.
