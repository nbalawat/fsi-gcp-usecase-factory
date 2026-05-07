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
  handler/                    # step 1: Cloud Run + Pub/Sub push
  agents/                     # step 4: ADK supervisor + specialists + prompts/
  sinks/<destination>/        # step 5: one folder per use-case-specific sink
  rules/                      # step 3: use-case-specific JDM rules (eligibility etc.)
  workflow.yaml               # Cloud Workflows orchestration for this use case
  infra/<use_case>.tf         # Terraform — Cloud Run services, Pub/Sub, IAM
  ui/console.yaml             # console pattern config (no custom UI code)
  tests/                      # end-to-end + adversarial tests for this use case
  docs/                       # spec, runbook, dependencies, SLOs
  compliance/                 # SR 11-7 model card, risk assessment, audit trail spec
  demo-data/                  # synthetic data for demos
```

**Rule:** never put use-case-specific code anywhere except under `usecases/<use_case>/`. If you're tempted to drop a credit-memo file into `agents/` or `workflows/` at the root — stop. That's the framework, not your use case.

## Approved models (only these in production)

- `claude-opus-4-7` for long-form reasoning, document IQ, narratives, multi-step decisioning
- `gemini-3-1-flash` for real-time scoring, high-volume classification, sub-second decisions

Never call any other model without an explicit `EXCEPTION:` comment citing the architecture review that approved it.

## The six console patterns (UI shape)

Every use case's UI fits one of:

1. **Real-time console** — sub-second decisions, throughput-dominant
2. **Investigations console** — case-level investigation with regulatory clocks
3. **Pipeline console** — multi-day flow through stages
4. **Surveillance console** — 2D state grid, continuous re-evaluation
5. **Run console** — periodic exercise toward a deadline
6. **Recommendations console** — agent suggestions queued for human disposition

Pick one; configure it via `usecases/<uc>/ui/console.yaml`. Do not build custom UI. See `docs/methodology/console_reference.md` for full details.

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

- `docs/methodology/architecture.md` — the 5-step paradigm and platform architecture
- `docs/methodology/console_reference.md` — the six console patterns in detail
- `docs/methodology/methodology.md` — how the plugin executes the methodology
