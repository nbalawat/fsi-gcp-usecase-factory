# Architecture reference — agentic banking platform

This document is the canonical architecture for the bank's agentic banking platform. Every use case follows the patterns described here. The plugin's skills, subagents, and hooks enforce them.

## The 5-step paradigm

Every use case in the platform follows the same five steps in the same order:

```
event → handler → atomic services → rules → agent → sinks
```

### Step 1: Handler

The handler is a Cloud Run service that receives Pub/Sub push messages. It:

1. Validates the schema (Pub/Sub Schemas does this; the handler trusts it)
2. Normalizes — converts source-format to canonical bank-internal shape
3. Enriches — adds reference data lookups (customer segment, MCC, channel)
4. Publishes to the next topic in the use case's topology

Handlers must NOT contain business logic. No "if amount > X then …" decisions. No calls to atomic services. No external API calls. The handler's job is to get a clean, normalized, enriched event onto the next topic.

Example: payment fraud handler receives an ISO 20022 payment message, validates the schema, converts to the bank's `Transaction` event, looks up the customer's segment and the merchant's MCC, publishes to `payments.received`.

### Step 2: Atomic services

Atomic services are stateless, pure-function Cloud Run services that perform one specific computation. Examples: `ofac-screen`, `dti-calc`, `merchant-risk-score`, `velocity-check`, `aml-pattern-scorer`.

The hard rule: **atomic services don't call other atomic services**. If a use case needs both OFAC screening and velocity checks, the workflow calls both in parallel and merges results. Composition is the workflow's job.

Atomic services are exposed as MCP tools so agents can call them.

### Step 3: Rules

The rules service is a single bank-wide service that wraps GoRules Zen. It evaluates JDM (JSON Decision Model) artifacts. Use cases publish JDM files to a Cloud Storage bucket; the rules service hot-reloads them.

Rules are **deterministic decisions**: clear / decline / gray-zone, eligible / ineligible, file / don't file. Thresholds live in BigQuery `rules_thresholds.*` tables, versioned by `effective_from` date.

Why JDM and not Python `if`/`else`? Three reasons:
- Compliance can read JDM without reading code
- Thresholds version separately from logic
- Auditors get a structured decision trace per evaluation

### Step 4: Agents

Agents are reasoning components built with Google's ADK (Agent Development Kit), deployed to Vertex AI Agent Runtime. They handle gray-zone cases the rules engine couldn't decisively settle.

Two patterns:
- **Single agent**: one `LlmAgent` makes one decision. Fast, simple use cases.
- **Inner workflow**: a supervisor agent coordinates multiple specialists (classifier, extractor, eligibility, narrative drafter). Complex use cases.

Agents call tools via MCP. They have memory scoped to a relevant entity (cardholder, customer, case, session). They produce structured JSON output matching a contract.

The bank uses exactly two foundation models in production:
- `claude-opus-4-7` — long-form reasoning, document IQ, narratives
- `gemini-3-1-flash` — real-time scoring, high-volume classification

### Step 5: Sinks

Sinks are Cloud Run services that write the workflow's outcomes to downstream destinations: core banking GL, FinCEN BSA E-Filing, customer notification systems, BigQuery audit tables, OMS for trade execution.

Sinks are idempotent. They handle exactly-once semantics for their destination, including retries and duplicate detection.

## Orchestration

Cloud Workflows orchestrates the 5 steps for each use case. One YAML per use case at `usecases/{use_case}/workflow.yaml`. The workflow:

- Receives the event from the handler
- Calls atomic services (often in parallel)
- Calls the rules service
- Branches on the rules result: clear path, decline path, or gray-zone (invoke agent)
- Calls the agent for gray-zone cases
- Routes to approval queue (HITL) or auto-publishes outcome
- Publishes to sinks

Workflows are deterministic glue. Decisions live in rules and agents, not in workflow YAML.

## Human-in-the-loop patterns

The platform supports five HITL patterns. Each use case picks one or more:

1. **Ambient** — agent runs autonomously; humans see logs only
2. **Notify and continue** — agent acts; human is informed after
3. **Approval gate** — workflow pauses for human disposition before irreversible action
4. **Collaborative copilot** — human drives; agent assists in real time
5. **Conversational** — natural-language multi-turn (customer-facing or internal)

Approval gate is the bank's default for irrevocable actions. The workflow publishes the case to an approval queue topic with a callback URL; the workflow stays paused until the human disposes.

## Console patterns

The platform's UI surfaces work through six console patterns. Each use case picks one:

1. **Real-time console** — sub-second decisions, throughput-dominant
2. **Investigations console** — case-level investigation with regulatory clocks
3. **Pipeline console** — multi-day flow through stages
4. **Surveillance console** — 2D state grid, continuous re-evaluation
5. **Run console** — periodic exercise toward a deadline
6. **Recommendations console** — agent suggestions queued for human disposition

See `console_reference.md` for full details.

## Observability

Every component is instrumented:

- **OpenTelemetry traces** with consistent span naming
- **Structured logs** via the bank's redacting logger
- **Audit log writes** to BigQuery `audit.*` tables
- **`context_id` propagation** through every event hop

This enables `/replay-incident <context_id>` — full causal reconstruction of any case.

## Data plane

| Concern | Service |
|---------|---------|
| Event streaming | Pub/Sub |
| Schema registry | Pub/Sub Schemas |
| Workflow state | Cloud Workflows |
| Reference data (low latency) | Bigtable |
| Reference data (relational) | AlloyDB / Cloud SQL |
| Audit logs | BigQuery (CMEK, 7-year retention) |
| Document storage | Cloud Storage (CMEK) |
| Agent memory | Memory Bank (backed by Bigtable) |
| Secrets | Secret Manager |

## Security and compliance

- Service accounts unique per service, least-privilege IAM
- VPC service controls perimeter for sensitive use cases
- CMEK on all customer data storage
- Model Armor on agent inputs (prompt injection defense)
- Audit log writes for every decision, every human action
- 7-year retention on audit data (regulatory)
- SR 11-7 documentation for every agent-decisioning use case

## Testing

Five layers (see `methodology.md`):

1. Service-pair contract tests
2. Use-case end-to-end tests (per PR, in ephemeral preview)
3. Cross-use-case integration tests (nightly, in persistent integration env)
4. External system integration tests (in bank's integration env)
5. Production-like load + canary (pre-promote and 24h post-deploy)

## Tooling

This plugin (`agentic-banking-platform`) executes the methodology:

- Slash commands for the work — `/new-use-case`, `/new-atomic-service`, etc.
- Skills that auto-invoke when relevant — `handler-design`, `adk-agent-design`, etc.
- Subagents for specialized roles — architecture-auditor, compliance-reviewer, etc.
- Hooks for floor-level enforcement — pre-commit architecture audit, session context

Read the README for installation and usage.
