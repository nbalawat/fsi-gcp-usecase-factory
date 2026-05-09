---
name: lifecycle-driver
description: How to drive a multi-stage agentic application end-to-end without Cloud Workflows — useful for local dev, debug, demo, or as a parity reference for the workflow YAML. Auto-loads when authoring a script that runs the full pipeline manually, or when needing to test an agent stack before Cloud Workflows is wired.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*)
---

# Lifecycle driver — the factory pattern

When Cloud Workflows isn't wired yet (or when you need a debuggable
in-process equivalent), a Python lifecycle driver is the bank's
standard pattern. It mirrors the workflow YAML stage-for-stage, but
runs in one process you can `import pdb`, log freely from, and trigger
with a single command.

## What you build

```
scripts/run_full_lifecycle_<uc>.py
```

It takes a borrower folder (or `--all`) and runs:

1. **Upload**     → POST /api/applications (or whatever the UC's intake is)
2. **Extract**    → for each doc, call document-extractor; update DB
3. **Validate**   → call /api/applications/<id>/validate; short-circuit on RETURN
4. **Atomic services** → fan out to N services in parallel
5. **Rules**      → call rules-service for deterministic policy
6. **Agents**     → call orchestrator-vN's agent endpoints in sequence
7. **Persist**    → write artifacts + final state via audit-writer

Each stage prints timing + cost. Total per case: depends on UC.

Reference: `scripts/run_full_lifecycle_v2.py` runs credit-memo-commercial
end-to-end in ~6 min for $0.68 (happy path) or ~1 min for $0.05
(validation-gate short-circuit).

## The 4 hard gates

| Gate | Why |
|---|---|
| **`_id_token(audience)` per service URL** | Cloud Run services require a Google-issued ID token. Cache per (audience, lifetime) — token lasts ~1h |
| **`.fsi-state/<svc>.url` files as the URL source of truth** | Deploy script writes one file per service; driver reads. Don't hardcode URLs |
| **Each stage prints timing + cost** | Lifecycle debugging requires seeing where the seconds + dollars go. Log per-stage |
| **Validation gate short-circuits stages 4-6** | When the gate returns RETURN_FOR_REVISION, don't burn $0.50 on agents. Skip straight to persist + return_notice |

## Real-world signals captured

- Vertex Gemini `max_output_tokens`: when the model truncates JSON
  mid-stream, `json.loads` fails. Bumped 6144 → 16384 for analyst,
  12288 for rater + reviewer, after observing real failures
- Cloud SQL Connector vs psycopg2: services without VPC connector MUST
  use the connector library + `INSTANCE_CONNECTION_NAME` + `DB_IP_TYPE=PUBLIC`
- Document-extractor with private-VPC egress can't reach Landing AI
  public endpoints — `--clear-vpc-connector` is the fix (Cloud SQL still
  reachable via the Connector)

## What's reusable

**Reusable**:
- The 7-stage skeleton (every UC has the same shape)
- The `_id_token` + `.fsi-state` URL pattern
- The validation-gate short-circuit (`if validation.decision == "RETURN": skip stages 4-6`)
- The "every stage prints timing + cost" discipline

**Per use case**:
- Stage 4's atomic-service URL list + payload shape (UC-specific)
- Stage 6's agent endpoint sequence (you may have 4 or 6 instead of 5)
- Stage 7's persistence shape (return_notice + memo + state are the
  credit-memo-commercial shape; mortgage might emit decision_letter
  + commitment_letter instead)

## Reference

- `scripts/run_full_lifecycle_v2.py` (357 lines)
- `services/orchestrator-credit-memo-v2/main.py` (5-agent host)
- `services/audit-writer/main.py` (DB-write broker)
