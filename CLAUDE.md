# Agentic banking platform — project conventions

You are working in a bank repository that uses the agentic banking platform methodology. This file is loaded into every Claude Code session in this repo. Read it carefully; it overrides general best practices when they conflict.

## The 5-step paradigm

Every use case follows the same pattern:

```
handler → atomic services → rules → agent → sinks
```

Never bypass any step. Never put rules logic in agents. Never put business decisions in handlers. Never let an atomic service call another atomic service. If you find yourself wanting to violate this, stop and run `/review-uc` to discuss.

## Directory structure (strict)

The repo has a hard separation between **framework** (shared across all 100+ use cases) and **use cases** (everything specific to one use case lives in one directory).

### Framework — shared, lives at the repo root

```
services/
  atomic/<service_name>/      # shared compute library; one folder per service
  rules-service/              # the one GoRules Zen engine for the whole bank
libraries/
  agents/<archetype>/         # parameterised agent archetypes
  patterns/<name>/            # multi-agent supervisor shapes
  workflows/<fragment>/       # reusable Cloud Workflows fragments
  use-cases/<archetype>/      # whole-use-case templates
infra/
  shared/                     # cloud_sql.tf, schema.sql — one DB for the whole bank
  modules/                    # reusable Terraform modules
policies/                     # OPA policies (CMEK, IAM, observability, tagging)
scripts/                      # shared tooling (deploy, lint, validate, test)
docs/methodology/             # architecture.md, methodology.md, console_reference.md
rules/                        # SHARED JDM rules (regulatory thresholds, single-borrower limits)
.claude/                      # the factory toolkit (skills, agents, hooks)
```

### Use case — everything for one use case lives in one directory

```
usecases/<use_case>/
  reasons.yaml                # the REASONS canvas — the spec, the contract
  schemas/                    # use-case-specific JSON schemas (artifacts, events)
  handler/                    # step 1: Cloud Run + Pub/Sub push
  agents/                     # step 4: ADK supervisor + specialists + prompts/
  sinks/<destination>/        # step 5: one folder per use-case-specific sink
  rules/                      # step 3: use-case-specific JDM rules (eligibility etc.)
  workflow.yaml               # Cloud Workflows orchestration for this use case
  infra/<use_case>.tf         # Terraform — Cloud Run services, Pub/Sub, IAM
  ui/                         # step 4 UI — UC-OWNED React components + lib + config
    console.yaml              #   console-pattern config (drives the shared shell)
    tsconfig.json             #   path-alias stub: @/* → console, @uc/* → here
    components/               #   USE-CASE-OWNED React components
      <feature>/              #     credit-memo/, agent-audit/, cco/, rm/, …
    lib/                      #   USE-CASE-OWNED data adapters, fixtures, types
  tests/                      # end-to-end + adversarial tests for this use case
  docs/                       # spec, runbook, dependencies, SLOs
  compliance/                 # SR 11-7 model card, risk assessment, audit trail spec
  demo-data/                  # synthetic data for demos
```

**Rule:** never put use-case-specific code anywhere except under
`usecases/<use_case>/`. This INCLUDES UI: every UC-specific React
component / data adapter / fixture / type lives at
`usecases/<uc>/ui/components/` or `usecases/<uc>/ui/lib/`.

The shared `ui/apps/<console-pattern>/` (e.g. `pipeline-console`) is the
**framework shell** — AppShell, persona switcher, route hosts, generic
primitives. It mounts the UC bundle via the `@uc/*` TypeScript path
alias. CI gate `scripts/lint_uc_in_console.mjs` blocks any UC-specific
file from landing in `ui/apps/<console>/`.

If you're tempted to drop a credit-memo file into `agents/`,
`ui/apps/pipeline-console/components/`, or `workflows/` at the root —
stop. That's the framework, not your use case.

## Approved models (only these in production)

- `claude-opus-4-7` for long-form reasoning, document IQ, narratives, multi-step decisioning
- `gemini-3-1-flash` for real-time scoring, high-volume classification, sub-second decisions

Never call any other model without an explicit `EXCEPTION:` comment citing the architecture review that approved it.

### Model-provider prerequisites (codified)

Each model brings hard prerequisites. Skipping any of them produces the
"I thought we were using ADK" pivot we paid for on credit-memo-commercial
(Rule 1 of `docs/methodology/product-build-discipline.md`). At
`/new-use-case` Step 2B, every UC declares:

| Provider | Required prerequisites |
|---|---|
| **Vertex Gemini** (`gemini-3-1-flash`, `gemini-2.5-pro`) | (1) GCP project with Vertex AI API enabled in the use case's region; (2) ADC available to the service account (Cloud Run sets it; local dev needs `gcloud auth application-default login`); (3) `roles/aiplatform.user` on the runtime SA; (4) region pinned in `discipline_gates.model_provider.region`; (5) for structured output, `response_schema` set per Rule 2; (6) SDK is `google-genai` `Client(vertexai=True, project=, location=)`. |
| **Anthropic API** (`claude-opus-4-7`, `claude-sonnet-4-6`) | (1) API key in Secret Manager (NOT env var checked into source); (2) key starts with `sk-ant-api` — OAuth/`sk-ant-oat` is rejected by the SDK; (3) Cloud Run mounts via `--set-secrets ANTHROPIC_API_KEY=...:latest`; (4) network egress allowed to `api.anthropic.com` (VPC connector + private-egress: check); (5) for structured output, prompt-only constraint; consider adopting Anthropic's "tool use" / structured-output features as they mature. |
| **Both (hybrid)** | All of the above. Gate via env flag `USE_GEMINI=1` for Vertex; falls back to Anthropic if key present. Document the routing in the orchestrator's call site. |

The full prerequisites + decision walkthrough lives at
`docs/methodology/model-prerequisites.md`. The `model-selection` skill
auto-loads it whenever you author or edit agent code.

## The six console patterns (UI shape)

Every use case's UI fits one of:

1. **Real-time console** — sub-second decisions, throughput-dominant
2. **Investigations console** — case-level investigation with regulatory clocks
3. **Pipeline console** — multi-day flow through stages
4. **Surveillance console** — 2D state grid, continuous re-evaluation
5. **Run console** — periodic exercise toward a deadline
6. **Recommendations console** — agent suggestions queued for human disposition

Pick a pattern; the UC owns its components/lib at `usecases/<uc>/ui/`,
and `ui/console.yaml` configures the shared shell. UC components are
imported via the `@uc/*` path alias from `ui/apps/<pattern>-console/`.
See `docs/methodology/console_reference.md` and `docs/methodology/ui-standards.md`.

## Data layer (Cloud SQL, portable)

Operational data (policy thresholds, audit events, GL postings, loan exposures) lives in **Cloud SQL PostgreSQL** — one instance for the whole bank, defined in `infra/shared/cloud_sql.tf`. Schema in `infra/shared/schema.sql`.

Services connect via the `DATABASE_URL` env var when set (any PostgreSQL — AWS RDS, Azure, on-prem) or fall back to the Cloud SQL Auth Proxy on GCP. This is how the platform stays portable.

BigQuery is for **analytics workloads only** — historical reporting, BI, data science. Never write operational data to BigQuery.

## Forbidden patterns (the architecture-auditor will block these)

- Business rules in Python `if`/`else` outside `services/rules-service/` or any `rules/` directory
- Atomic services calling other atomic services (use the workflow)
- Cloud Workflows YAML files over 500 lines (decompose into named sub-workflows)
- Agents calling external APIs directly without going through an atomic service or MCP tool
- Hardcoded thresholds in code (must live in the Cloud SQL `thresholds` table, versioned by `effective_date`)
- Custom frontend code outside the configured console
- Auto-execution of irrevocable actions (every irrevocable action goes through the approval queue)
- Models other than the two approved without explicit exception
- PII in logs (use the redacting logger)
- `print()` in production code (use the structured logger)
- Putting use-case-specific files anywhere except under `usecases/<use_case>/`

## Required for every use case

Every `usecases/<use_case>/` directory must contain:

- `reasons.yaml` — the REASONS canvas (R/E/A/S/O/N/S sections)
- `docs/spec.md` — one-page use case specification
- `docs/dependencies.yaml` — what it consumes and produces
- `docs/slos.yaml` — latency budget, error rate, decision distribution
- `compliance/` — model card, risk assessment, audit trail spec (SR 11-7)
- `tests/` — end-to-end test suite
- `workflow.yaml` — Cloud Workflows orchestration

## Always before committing

Run `/review-uc <use_case>` on any new or modified use case. It runs the architecture audit, security review, test coverage check, and compliance pack completeness check.

## When in doubt

The plugin includes auto-invoked skills that will guide you. If you're building a handler, the `handler-design` skill will load. If you're authoring a rule, the `author-rule` workflow guides you. If something feels uncertain, ask Claude what skill applies and read the relevant reference docs.

## Reference documents

- `docs/methodology/README.md` — entry point, "trying to X → run Y" table
- `docs/methodology/architecture.md` — the 5-step paradigm and platform architecture
- `docs/methodology/console_reference.md` — the six console patterns in detail
- `docs/methodology/methodology.md` — how the plugin executes the methodology
- `docs/methodology/ui-standards.md` — **UI standards** (the contract for every console; tokens, primitives, layout, behavior gates, a11y; auto-loaded by the `ui-standards` skill on any UI edit)
- `docs/methodology/model-prerequisites.md` — **provider prerequisites** (Vertex Gemini ADC vs Anthropic API: auth, region, IAM, network, SDK, structured output, common failures; auto-loaded by the `model-selection` skill)
- `docs/methodology/product-build-discipline.md` — **the don't-repeat list** (28 rules paid for in real incidents on credit-memo-commercial; every `/new-use-case` and `/review-uc` enforces them)
- `docs/methodology/ui-authoring.md` — *deprecated, see ui-standards.md*
- `AUTHORING.md` — skill / agent authoring conventions

## Product-build discipline — hard gates

Every new use case MUST satisfy the 28 rules in
`docs/methodology/product-build-discipline.md`. The rules are organized
into themes (model & provider, data & state, UX, deploy & ops, contracts,
process); each rule has a paired CI gate enforced by `/review-uc`.

The most expensive rules to skip — confirmed by incidents on
credit-memo-commercial:

- **Rule 2** — structured-output agents need `response_schema` (prompt
  rules don't hold).
- **Rule 4** — no static demo data past day 1.
- **Rules 8–10** — never dump intermediate state into user-facing fields;
  never truncate forensics.
- **Rule 7** — idempotency guard on every async handler (Pub/Sub WILL
  redeliver).
- **Rule 13** — live > polled > static (SSE for in-flight work).
- **Rule 14** — defensive UI everywhere (schema drift is real).
- **Rule 20** — required env vars hard-fail at boot.
- **Rule 21** — Cloud Run timeout sized to measured P99.

`/new-use-case` Step 2B asks the team to make these decisions at scaffold
time; skipping them creates the bugs we already paid for.

## UI work — hard gates

Anything under `ui/apps/` or `ui/packages/` MUST satisfy the seven rules in
`docs/methodology/ui-authoring.md`. The pre-commit hook runs `scripts/test_ui_smoke.mjs`
when UI files change and a dev server is running; the same script runs in CI.

Mistakes already paid for (do not repeat):
- Buttons without onClick or href → use Link or remove the affordance
- `<div>` styled as a search box → use real `<input type="search">`
- Only one cell of a row clickable → wrap in `<CaseRow href="…">`
- Wide components (`ProcessFlow`, `AgentChain`) inside narrow drawers → use the `*Mini` variant
- Inline functions passed from Server pages to Server components → move boundary into a Client child
- Bare `<button>` for nav → every nav item has `href`

## What the factory ships

- **24 skills** at `.claude/skills/` (slash commands + auto-invoked design knowledge)
- **22 specialised subagents** at `.claude/agents/` (builders, validators, gatekeepers, authors)
- **8 atomic services** at `services/atomic/` (financial-spreader, dscr-calculator, covenant-analyzer, peer-benchmarker, industry-risk-scorer, collateral-valuator, exposure-aggregator, insider-screening)
- **11 Terraform modules** at `infra/modules/` (atomic_service, handler_service, rules_service, agent_runtime_deployment, cloud_workflow, sink_adapter, pubsub_topic, cloud_sql_instance, bigtable_memory_cluster, secret, otel_collector, use_case_template)
- **6-layer reuse library** at `libraries/` (10 agent archetypes, 5 multi-agent patterns, 8 workflow fragments, 6 use-case archetypes)
- **3 environment roots** at `infra/{dev,staging,prod}/`
- **`make test-all`** runs the full deterministic test pyramid in <30s; `make test-llm` opts in to live Claude calls

## Two-path correction protocol (hard rule)

| Change type | Path | Skill |
|---|---|---|
| **Behavior change** (threshold, model, prompt, tool, sink) | REASONS-first | `/fsi-prompt-update <uc>` |
| **Pure refactor** (rename, extract, restructure — no behavior change) | Code-first | `/fsi-sync <uc>` |

Any commit that changes runtime behavior MUST update REASONS in the same PR. The architecture-auditor blocks the commit on REASONS↔code drift.
