# Agentic Banking Factory — methodology + complete reference

This is the canonical entry point for the FSI agentic banking factory. The factory is a Claude Code-native toolkit that lets a small platform team produce a full banking use case — handler, atomic services, rules, agent, sinks, infra, compliance pack — by composing reusable shapes from a versioned library, then validating every output through a layered test pyramid.

Read in this order:

1. `architecture.md` — the 5-step paradigm and platform architecture
2. `console_reference.md` — the six console patterns
3. `methodology.md` — how the factory executes the methodology
4. This file (when you're trying to do X → run Y)

---

## When you're trying to X → run Y

| When you want to … | Run / read |
|---|---|
| Start a brand-new use case | `/init-use-case "<name>"` then `/new-use-case` |
| Author the REASONS canvas | `/fsi-reasons-canvas` (auto-loads when editing reasons.yaml) |
| Search the libraries before building | `/fsi-search-library "<intent>"` |
| Add a new atomic service | `/new-atomic-service` |
| Add a new JDM rule | `/author-rule` |
| Add a new agent (single or supervisor) | `/new-agent` |
| Author the workflow YAML | the `workflow-design` skill auto-loads |
| Configure the use case's UI | `console-config-builder` (driven by REASONS) |
| Generate the SR 11-7 compliance pack | `/compliance-pack` |
| Build the entire use case in parallel | `/fsi-build-parallel` |
| Change a threshold / model / prompt | `/fsi-prompt-update <uc>` (REASONS-first; never edit code directly) |
| Sync REASONS after a refactor | `/fsi-sync <uc>` (code-first; no behavior change) |
| Review a use case before commit | `/review-uc <uc>` |
| Review just the intent (R/E/A/S) | `/fsi-reasons-review <uc>` |
| Promote a shape to the shared library | `/fsi-promote-to-library` (rule of three) |
| See reuse % across the portfolio | `/fsi-reuse-report` |
| Promote a use case to staging/prod | `/promote <uc>` |
| Deploy a use case to GCP | `/fsi-deploy <uc> [--env=...]` |
| See portfolio status | `/fsi-portfolio` |
| Check ADK SDK conventions | the `fsi-adk-patterns` skill auto-loads |
| Pick the right model | the `model-selection` skill auto-loads |
| Pick the right console | `console_reference.md` then the matching `console-<pattern>` skill |

## When the factory should refuse you

| Trying to … | Why it's blocked |
|---|---|
| Edit generated code directly to change behavior | Use `/fsi-prompt-update`. The architecture-auditor blocks the commit if REASONS and code drift. |
| Use a model not in `{claude-opus-4-7, gemini-3-1-flash}` | Bank policy. Add an `EXCEPTION:` comment with arch-review approval if truly needed. |
| Have an atomic service call another atomic service | Composition belongs in the workflow. Refactor. |
| Write a Cloud Workflow YAML > 500 lines | Decompose into named sub-workflows. |
| Hardcode a threshold value | Read from the Cloud SQL `thresholds` table; versioned by `effective_date`. |
| Grant `agent_runtime_sa` publisher rights on `approval_events` | Self-approval risk. The Terraform `check` block fails the apply. |
| Build custom React for a use case | Configure one of the six consoles via `usecases/<uc>/ui/console.yaml`. |
| Promote without compliance signatures | The `/promote` skill refuses. Sign each row in `signatures_required.md` first. |

---

## Repo layout (cheat sheet)

```
.claude/                              # the factory (skills + agents + hooks + settings)
├── skills/                           # 24 slash commands and auto-invoked knowledge
├── agents/                           # 22 specialised subagents
└── hooks/                            # pre-commit, session-start, status-line wiring

CLAUDE.md                             # always-loaded conventions
AUTHORING.md                          # SKILL.md / agent-md authoring rules

services/
├── atomic/<name>/                    # 8 reusable atomic services (compute layer)
└── rules-service/                    # the bank's single Zen JDM engine

libraries/                            # six-layer reuse catalog
├── agents/<archetype>/               # 10 agent archetypes (L3)
├── patterns/<pattern>/               # 5 multi-agent patterns (L4)
├── workflows/<fragment>/             # 8 workflow fragments (L5)
└── use-cases/<archetype>/            # 6 use-case archetypes (L6)

infra/
├── shared/                           # one-time per env: Cloud SQL, VPC, secrets
├── modules/<module>/                 # 11 reusable Terraform modules
├── dev/, staging/, prod/             # env-level shared infra (OTel, Memory Bank)

policies/                             # OPA + Conftest + JDM + REASONS schemas
scripts/                              # ~20 helper scripts (deploy / lint / validate)
docs/methodology/                     # this directory
rules/                                # framework-shared JDM rules

usecases/<use_case>/                  # everything for one use case in one tree
├── reasons.yaml                      # the REASONS canvas — the contract
├── handler/, agents/, sinks/         # 5-step paradigm components
├── workflow.yaml                     # Cloud Workflows orchestration
├── infra/<uc>.tf                     # ~150-line module composition
├── tests/, ui/, docs/, compliance/, demo-data/
```

## Test pyramid (what catches what)

| Layer | What it asserts | When it runs |
|---|---|---|
| **L0 Lint** | Skill / agent frontmatter shape; bash syntax; rego validity; HCL fmt; required label inputs | every PR |
| **L0 OPA** | CMEK / IAM / networking / observability / tagging policy compliance | every PR (when conftest installed) |
| **L0 Hooks** | pre-commit + session-start work; right exit codes | every PR |
| **L0 Scripts** | shellcheck + smoke tests on `scripts/*.sh` | every PR |
| **L1 Skills + agents** | 269 lint checks across 24 skills + 22 agents | every PR |
| **L2 Builders** | Each builder's golden output passes its gating validator | every PR (deterministic); LLM tier nightly |
| **L3 Validators** | service / rule / agent validators catch what they claim (12 negative fixtures) | every PR |
| **L4 Gatekeepers** | architecture / security / compliance auditors catch real violations (14 negative fixtures) | every PR |
| **Library lint** | Every archetype / pattern / fragment / UC archetype has required files + valid metadata | every PR |
| **Atomic service unit** | 264 tests across 8 services; real SQLite, zero mocks | every PR |
| **Factory e2e** | Synthetic REASONS canvas → every operation kind has a working builder + validator pipeline | every PR |
| **Determinism** | `scripts/test_parallel_build_equivalence.sh` — sequential vs parallel build = byte-identical | nightly |

`make test-all` runs the deterministic tier (~30s, fully offline). `make test-llm` opts in to the LLM tier.

## What's intentionally out of scope

- **Per-tenant data isolation.** Each customer of the bank's pipeline has their own row-level access via Cloud SQL RLS, not a separate environment.
- **Cross-region failover.** Each environment is single-region in dev/staging; prod is regional + multi-zone but not multi-region.
- **AI-judging-AI for narrative quality.** Citation density + adversarial test set is the floor; deeper eval is per-UC, owned by the model owner.

## Maintenance

The platform team owns the factory. Use case teams contribute via PR. Every PR runs the framework test pyramid; deploy and promotion go through `/promote` which gates on signatures + cross-impact analysis. Versions follow semver; breaking changes get major version bumps with migration guides.

## Authoring conventions

See `AUTHORING.md` for skill / agent / hook authoring rules. Hard rules are linted by `tests/framework/skills/`; new entries that violate them fail the build.
