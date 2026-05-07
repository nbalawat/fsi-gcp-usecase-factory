# Framework tests

Tests for the **factory itself** — skills, builders, validators, gatekeepers, hooks, scripts, policies, library entries. Distinct from per-service unit tests.

The factory's job is to produce a working use case from a REASONS canvas. These tests prove the factory does that correctly.

## Layout

```
tests/framework/
├── harness/                 # shared utilities
│   ├── claude_runner.py     # invoke a Claude agent / validator; parse findings
│   ├── findings_parser.py   # canonical findings shape
│   └── tree_snapshot.py     # byte-stable directory tree diff for golden tests
├── skills/                  # L1 — skill + agent lint (215 checks)
├── builders/                # L2 — builder contract tests (3 builders × 1 case)
├── validators/              # L3 — service / rule / agent validators (12 fixtures)
├── gatekeepers/             # L4 — architecture / security / compliance (14 fixtures)
├── policies/                # L0 — OPA rego unit tests
├── hooks/                   # pre-commit + session-start hook tests
├── scripts/                 # bash syntax + shellcheck + smoke tests for scripts/*.sh
└── factory/                 # end-to-end: synthetic REASONS → all builders + validators
```

## Two run modes

### Deterministic (default — fast, free, runs every PR)

Re-implements each gatekeeper / validator's grep / regex / file-presence rules as plain Python. Catches regressions in the *rules* the gatekeepers enforce.

```bash
make test-framework      # framework only
make test-all            # framework + atomic services + rules-service
```

### LLM (nightly — invokes the actual agents via Anthropic API)

Marked `@pytest.mark.llm`; gated by `RUN_LLM_TESTS=1` and `ANTHROPIC_API_KEY`.

```bash
RUN_LLM_TESTS=1 ANTHROPIC_API_KEY=sk-... make test-llm
```

Validates that the actual Claude agent applies its rules correctly, not just the deterministic re-implementation.

## Test pyramid coverage

| Layer | What's tested | Tests | Pattern |
|---|---|---|---|
| **L0 Policies** | OPA rego rules + meta (every policy has a test file) | 5 rego files + 2 pytest | rego positive/negative + `opa test` |
| **L0 Hooks** | pre-commit + session-start | 8 | bash syntax, shellcheck, behavior smoke |
| **L0 Scripts** | every `scripts/*.sh` | 53 | bash syntax, shellcheck, behavior smoke |
| **L1 Skills + agents** | 23 skills + 13 agents conform to AUTHORING.md | 225 | Frontmatter + length + naming + template refs |
| **L2 Builders** | 3 builder agents produce valid output | 6 (3 deterministic + 3 LLM) | golden_output passes its gating validator |
| **L3 Validators** | 3 validators (service / rule / agent) catch what they claim | 24 | clean + 3 violations × 2 tiers |
| **L4 Gatekeepers** | architecture / security / compliance catch real violations | 28 | clean + 4-5 violations × 2 tiers |
| **Factory e2e** | synthetic REASONS → kinds map to working builder + validator pipelines | 5 | every operation kind in REASONS has a working builder fixture |

## Key disciplines

1. **No mocks**. Atomic-service tests use real SQLite. Validator/gatekeeper tests use real file trees with real violations.
2. **Negative fixtures forced 6 real bugs** in the deterministic checks during development (the `/tests/` filter, comment fooling, docstring fooling, AST vs substring, etc.).
3. **No new overlong skills**. `test_no_new_overlong_skills` blocks PRs that add 200+ line SKILL.md files.
4. **Builder contract tests automatically tighten** when validators get stricter — golden trees break, forcing regeneration.

## Adding a new violation fixture

1. Create `<layer>/fixtures/<scenario>/` with the minimum file tree to trigger the violation.
2. Add a `MANIFEST.yaml` describing the gatekeeper/validator + expected verdict + expected cited file.
3. Verify with `pytest -k <scenario>`.

See each layer's `fixtures/README.md` for layer-specific conventions.
