# approval-gate@1.0

## What it does
Implements the canonical HITL pattern: create a callback URL, publish the case to an approver queue topic, pause until the approver UI POSTs back, then branch on `disposition`.

## When to use
Whenever an irrevocable action (GL post, customer-facing comms, decline) requires human sign-off. Required by the platform for any auto-execution boundary.

## Parameters
- `queue_topic` — Pub/Sub topic feeding the approver console (e.g. `credit-officer-queue`).
- `callback_timeout_seconds` — wall-clock time to wait. Default 432000 (5 days). Cloud Workflows supports up to 1 year.
- `approval_payload_template` — what to send to the approver UI. Should bundle case + agent recommendation + regulatory context.
- `on_approve_var` / `on_reject_var` — workflow vars receiving the callback body for downstream branching.

## Example instantiation
```yaml
queue_topic: projects/bank-prod/topics/credit-officer-queue
callback_timeout_seconds: 432000
approval_payload_template: '${{"case": enriched, "memo": agent_outcome.body, "use_case": use_case}}'
on_approve_var: approver_decision
on_reject_var: rejection_reason
```

The approver UI must POST `{disposition: "approve"|"reject", reason: "...", approver_id: "..."}` to the callback URL. On timeout the fragment raises; on unknown disposition it raises `ApprovalUnknownDisposition`.
