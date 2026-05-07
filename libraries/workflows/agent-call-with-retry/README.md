# agent-call-with-retry@1.0

## What it does
Calls an ADK agent endpoint with the primary model under a retry policy, and on terminal failure optionally retries once with a fallback model. Returns the response in `agent_outcome`.

## When to use
Step 4 (agent invocation) of every use case. Fallback is appropriate when the primary is `claude-opus-4-7` for narrative work and `gemini-3-1-flash` is an acceptable degraded path (or vice versa). Omit fallback when the primary is mandatory by policy.

## Parameters
- `agent_url` — Cloud Run URL of the ADK agent runtime.
- `input_template` — agent input expression (must propagate `context_id`).
- `primary_model` — `claude-opus-4-7` or `gemini-3-1-flash`.
- `fallback_model` — same enumeration; empty string disables fallback.
- `retry_max` — primary retry attempts (default 2).
- `retry_initial_delay_s` — initial backoff seconds (default 4, multiplier 2).

## Example instantiation
```yaml
agent_url: https://credit-memo-supervisor-xyz.run.app/invoke
input_template: '${{"case": enriched, "rule_outcomes": rule_outcomes}}'
primary_model: claude-opus-4-7
fallback_model: gemini-3-1-flash
retry_max: 2
retry_initial_delay_s: 4
```
