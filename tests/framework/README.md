# Framework tests

Tests for the **factory itself** — skills, builder agents, validator agents, gatekeepers, libraries, scripts. Distinct from per-service unit tests.

The factory's job is to produce a working use case from a REASONS canvas. These tests prove the factory does that correctly.

## Layout

```
tests/framework/
├── harness/                 # shared utilities
│   ├── claude_runner.py     # invoke a Claude agent against a fixture; parse findings
│   ├── findings_parser.py   # canonical findings shape (severity + file + line + rule)
│   └── tree_snapshot.py     # byte-stable directory tree diff for golden tests
├── gatekeepers/             # L4 — gatekeeper agents (architecture/security/compliance)
│   ├── fixtures/            # one subdir per fixture (clean + violation_<kind>/)
│   ├── test_architecture_auditor.py
│   ├── test_security_reviewer.py
│   └── test_compliance_reviewer.py
├── validators/              # L3 — service/rule/agent validators (pending)
├── builders/                # L2 — builder agents (pending)
└── skills/                  # L1 — skill behavior tests (pending)
```

## How a gatekeeper test works

1. **Fixture** is a real, self-contained directory tree under `gatekeepers/fixtures/<scenario>/`. Either a clean mini-use-case (`clean/`) or one with a specific violation (`violation_<kind>/`).
2. **Test** invokes the gatekeeper against the fixture and asserts:
   - Clean fixture → PASS / no findings
   - Violation fixture → FAIL with the specific violation cited at the right file:line

## Two run modes

### Deterministic mode (default)

Runs the **deterministic checks** the gatekeepers describe in their `.md` prompts (grep/regex/file-presence rules) as Python re-implementations. Fast, free, runs in CI.

```bash
pytest tests/framework/gatekeepers -q
```

This catches regressions in the *rules* the gatekeepers enforce. It does NOT validate that the LLM agent itself correctly applies those rules.

### LLM mode (nightly)

Invokes the actual Claude agent via the Anthropic API against each fixture. Slower, costs API tokens, requires `ANTHROPIC_API_KEY`.

```bash
RUN_LLM_TESTS=1 ANTHROPIC_API_KEY=sk-... pytest tests/framework/gatekeepers -q -m llm
```

Tests marked `@pytest.mark.llm` are skipped by default; run with `-m llm` (or `RUN_LLM_TESTS=1`) to include them.

## Adding a new violation fixture

1. Create `gatekeepers/fixtures/violation_<kind>/` with the minimum file tree to trigger the violation.
2. Add a `MANIFEST.yaml` next to it describing what's wrong, expected severity, expected cited file.
3. Add a test method to the appropriate gatekeeper test file.
4. Verify with `pytest -k violation_<kind>`.

See `gatekeepers/fixtures/README.md` for fixture conventions.
