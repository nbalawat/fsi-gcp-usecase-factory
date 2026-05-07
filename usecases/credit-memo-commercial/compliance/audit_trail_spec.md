# Audit Trail Specification — credit-memo-commercial

**Framework:** SR 11-7 / OCC Credit Risk Examination  
**Retention:** 7 years (federal banking record-keeping regulation)  
**Correlation key:** `context_id` — propagated to every service call, agent invocation, rule evaluation, and approval action  
**Last updated:** 2026-05-07

---

## Overview

Every invocation of the credit-memo-commercial pipeline produces a complete, reconstructible audit trail. The `context_id` UUID is generated at the handler when the `loans.application.submitted` event is received and attached to every downstream record. An OCC examiner or internal auditor can query a single `context_id` to retrieve every input, output, decision, and human action associated with a given credit memo.

---

## Audited Events

| Event Category | When Captured | Storage Location |
|---|---|---|
| Handler enrichment | On Pub/Sub event receipt | `audit.handler_events` |
| Atomic service calls (all 8) | On each service invocation and response | `audit.atomic_service_events` |
| Rules engine evaluations (all 3 rules) | On each rule evaluation request and result | `audit.rules_service_events` |
| Agent invocations (all 4 agents) | On each agent call start, completion, or failure | `audit.agent_events` |
| Supervisor validation | On bundle validation pass or fail | `audit.agent_events` |
| Approval queue routing | On memo delivery to credit-officer-queue | `audit.workflow_events` |
| Regulatory clock events | On clock start, countdown events, and alarm | `audit.workflow_events` |
| Credit officer action | On approve, decline, or return-for-revision | `audit.approval_events` |
| GL posting | On post-approval GL entry | `audit.gl_posting_events` |
| GCS artifact write | On memo.json write to GCS | `audit.sink_events` |
| DLQ routing | On failure route to DLQ | `audit.workflow_events` |

---

## BigQuery Table Schemas

All tables reside in the `audit` dataset. All timestamps are UTC. All tables are append-only; records are never updated or deleted during the 7-year retention window.

### `audit.handler_events`

| Column | Type | Description |
|---|---|---|
| `event_id` | STRING | Unique event record ID (UUID) |
| `context_id` | STRING | Pipeline correlation key |
| `borrower_id` | STRING | Borrower identifier |
| `loan_application_id` | STRING | Source loan application ID |
| `received_at` | TIMESTAMP | When the Pub/Sub event was received |
| `enrichment_status` | STRING | SUCCESS or FAILURE |
| `enrichments_applied` | ARRAY<STRING> | List of enrichments applied (e.g., borrower-master, financial-statement-blob) |
| `error_message` | STRING | Populated on failure; null on success |
| `ingested_at` | TIMESTAMP | BigQuery write time |

### `audit.atomic_service_events`

| Column | Type | Description |
|---|---|---|
| `event_id` | STRING | Unique event record ID (UUID) |
| `context_id` | STRING | Pipeline correlation key |
| `borrower_id` | STRING | Borrower identifier |
| `service_name` | STRING | e.g., `financial-spreader`, `dscr-calculator` |
| `invocation_id` | STRING | Service-level invocation UUID |
| `called_at` | TIMESTAMP | When the service was called |
| `completed_at` | TIMESTAMP | When the response was received |
| `latency_ms` | INTEGER | Elapsed time in milliseconds |
| `input_schema_version` | STRING | Schema version of inputs passed |
| `output_schema_version` | STRING | Schema version of outputs returned |
| `status` | STRING | SUCCESS, FAILURE, or TIMEOUT |
| `output_summary` | JSON | Non-PII summary of outputs (e.g., dscr_base: 1.42, dscr_stressed: 1.08) |
| `error_message` | STRING | Populated on failure; null on success |
| `ingested_at` | TIMESTAMP | BigQuery write time |

Note: Full atomic-service outputs are stored in GCS alongside the memo artifact, not in BigQuery, to manage column size and avoid PII in audit tables.

### `audit.rules_service_events`

| Column | Type | Description |
|---|---|---|
| `event_id` | STRING | Unique event record ID (UUID) |
| `context_id` | STRING | Pipeline correlation key |
| `borrower_id` | STRING | Borrower identifier |
| `rule_ref` | STRING | e.g., `regulatory_thresholds@2026-q2` |
| `rule_version` | STRING | JDM artifact version |
| `evaluated_at` | TIMESTAMP | When the rule was evaluated |
| `inputs` | JSON | Rule input values (non-PII scalars: loan_amount, risk_band, single_borrower_pct) |
| `outputs` | JSON | Rule output values (e.g., threshold_breaches: [], limit_status: PASS) |
| `status` | STRING | PASS or BREACH |
| `ingested_at` | TIMESTAMP | BigQuery write time |

### `audit.agent_events`

| Column | Type | Description |
|---|---|---|
| `event_id` | STRING | Unique event record ID (UUID) |
| `context_id` | STRING | Pipeline correlation key |
| `borrower_id` | STRING | Borrower identifier |
| `agent_id` | STRING | e.g., `credit_memo_supervisor`, `credit_memo_rater` |
| `agent_archetype` | STRING | e.g., `risk-rater@1.0` |
| `model_id` | STRING | Model used (e.g., `claude-opus-4-7`) |
| `invocation_id` | STRING | Agent invocation UUID |
| `started_at` | TIMESTAMP | When the agent was called |
| `completed_at` | TIMESTAMP | When the agent returned |
| `latency_ms` | INTEGER | Elapsed time in milliseconds |
| `status` | STRING | SUCCESS, FAILURE, or VALIDATION_FAIL |
| `output_schema` | STRING | Output schema name (e.g., `RiskRating`, `CreditMemo`) |
| `citation_density` | FLOAT | For drafter agent: citation density of produced memo |
| `risk_band` | STRING | For rater agent: assigned OCC risk band |
| `validation_errors` | ARRAY<STRING> | Supervisor validation errors, if any |
| `error_message` | STRING | Populated on failure; null on success |
| `ingested_at` | TIMESTAMP | BigQuery write time |

Note: Agent prompt contents are never logged. The redacting-logger is applied before all model calls; no PII reaches this table or any log sink.

### `audit.approval_events`

| Column | Type | Description |
|---|---|---|
| `event_id` | STRING | Unique event record ID (UUID) |
| `context_id` | STRING | Pipeline correlation key |
| `borrower_id` | STRING | Borrower identifier |
| `loan_application_id` | STRING | Source loan application ID |
| `routed_to_queue_at` | TIMESTAMP | When memo was placed in credit-officer-queue |
| `regulatory_clock_deadline` | TIMESTAMP | 5-business-day deadline timestamp |
| `action` | STRING | APPROVED, DECLINED, or RETURNED_FOR_REVISION |
| `acted_by` | STRING | IAM identity of the credit officer (email) |
| `acted_at` | TIMESTAMP | When the credit officer action was recorded |
| `decline_reason` | STRING | Required if action = DECLINED; null otherwise |
| `revision_notes` | STRING | Required if action = RETURNED_FOR_REVISION; null otherwise |
| `time_to_decision_hours` | FLOAT | Hours from routed_to_queue_at to acted_at |
| `regulatory_clock_breached` | BOOL | True if acted_at > regulatory_clock_deadline |
| `ingested_at` | TIMESTAMP | BigQuery write time |

### `audit.gl_posting_events`

| Column | Type | Description |
|---|---|---|
| `event_id` | STRING | Unique event record ID (UUID) |
| `context_id` | STRING | Pipeline correlation key |
| `borrower_id` | STRING | Borrower identifier |
| `loan_application_id` | STRING | Source loan application ID |
| `approval_event_id` | STRING | Foreign key to `audit.approval_events.event_id` |
| `posted_at` | TIMESTAMP | When the GL entry was written |
| `gl_entry_id` | STRING | GL ledger entry identifier |
| `amount_usd` | NUMERIC | Loan commitment amount |
| `status` | STRING | SUCCESS or FAILURE |
| `error_message` | STRING | Populated on failure; null on success |
| `ingested_at` | TIMESTAMP | BigQuery write time |

### `audit.sink_events`

| Column | Type | Description |
|---|---|---|
| `event_id` | STRING | Unique event record ID (UUID) |
| `context_id` | STRING | Pipeline correlation key |
| `sink_name` | STRING | e.g., `document-store-gcs`, `credit-officer-queue` |
| `written_at` | TIMESTAMP | When the sink write completed |
| `artifact_path` | STRING | GCS path for document-store-gcs; topic for Pub/Sub sinks |
| `status` | STRING | SUCCESS or FAILURE |
| `error_message` | STRING | Populated on failure; null on success |
| `ingested_at` | TIMESTAMP | BigQuery write time |

### `audit.workflow_events`

| Column | Type | Description |
|---|---|---|
| `event_id` | STRING | Unique event record ID (UUID) |
| `context_id` | STRING | Pipeline correlation key |
| `event_type` | STRING | e.g., CLOCK_START, CLOCK_ALARM, DLQ_ROUTE, APPROVAL_CALLBACK_RECEIVED |
| `workflow_execution_id` | STRING | Cloud Workflows execution ID |
| `occurred_at` | TIMESTAMP | When the workflow event occurred |
| `details` | JSON | Event-specific metadata |
| `ingested_at` | TIMESTAMP | BigQuery write time |

---

## Audit Trail Reconstruction

To reconstruct the complete audit trail for a given `context_id`:

```sql
-- 1. Retrieve all records across all audit tables for a context_id
-- Run each query and join results by context_id and timestamp ordering.

SELECT 'handler'        AS layer, event_id, context_id, borrower_id, received_at      AS occurred_at, enrichment_status AS status, error_message
  FROM audit.handler_events WHERE context_id = @context_id

UNION ALL

SELECT 'atomic_service' AS layer, event_id, context_id, borrower_id, called_at         AS occurred_at, status,           error_message
  FROM audit.atomic_service_events WHERE context_id = @context_id

UNION ALL

SELECT 'rules'          AS layer, event_id, context_id, borrower_id, evaluated_at      AS occurred_at, status,           NULL AS error_message
  FROM audit.rules_service_events WHERE context_id = @context_id

UNION ALL

SELECT 'agent'          AS layer, event_id, context_id, borrower_id, started_at        AS occurred_at, status,           error_message
  FROM audit.agent_events WHERE context_id = @context_id

UNION ALL

SELECT 'approval'       AS layer, event_id, context_id, borrower_id, acted_at          AS occurred_at, action AS status,  NULL AS error_message
  FROM audit.approval_events WHERE context_id = @context_id

UNION ALL

SELECT 'gl_posting'     AS layer, event_id, context_id, borrower_id, posted_at         AS occurred_at, status,           error_message
  FROM audit.gl_posting_events WHERE context_id = @context_id

ORDER BY occurred_at ASC;
```

This query returns a complete chronological event log for the memo lifecycle, from Pub/Sub receipt through GL posting.

---

## Retention Policy

| Table | Retention | Enforcement |
|---|---|---|
| All `audit.*` tables | 7 years | BigQuery table expiration policy disabled; partition expiration set to 2,555 days |
| GCS memo artifacts | 7 years | GCS lifecycle rule: delete after 2,555 days from object creation |
| Cloud Logging entries | 7 years | Log sink to BigQuery `audit.workflow_events`; Cloud Logging native retention 400 days only |

The 7-year retention aligns with 12 CFR Part 12 (national bank record-keeping) and OCC examination access requirements.

---

## Access Controls

| Role | Access | Purpose |
|---|---|---|
| `credit-officer` | Read (approval queue only) | Approve / decline / revise memos |
| `platform-team` | Read/Write (all audit tables) | Operational support and incident response |
| `compliance-auditor` | Read (all audit tables, GCS artifacts) | Internal audit and regulatory examination preparation |
| `occ-examiner` (temporary) | Read (all audit tables, GCS artifacts) | OCC examination access; granted per-examination via IAM Conditions |
| Service accounts | Write (append-only, specific table) | Each service writes only to its designated audit table |

All access to audit tables is logged in Cloud Logging. `occ-examiner` access grants are time-bounded and require approval from the CISO team.

---

## Examiner Access Procedure

1. Compliance officer receives OCC examination notice.
2. CISO team creates a temporary `occ-examiner` service account with Read access to `audit.*` and the GCS memo bucket, scoped to the examination date range via IAM Conditions.
3. Compliance officer provides the examiner with the BigQuery project ID, dataset name, and GCS bucket name.
4. At examination close, CISO team revokes the temporary service account.
5. The access grant and revocation are logged in `audit.workflow_events` (event_type: EXAMINER_ACCESS_GRANTED / EXAMINER_ACCESS_REVOKED).

---

*This document is derived from `usecases/credit-memo-commercial/reasons.yaml`. Do not edit directly — update reasons.yaml and regenerate via `/fsi-build-parallel`.*
