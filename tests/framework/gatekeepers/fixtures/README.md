# Gatekeeper test fixtures

Each fixture is a **self-contained directory tree** that the gatekeeper agent
can audit in isolation. Either `clean/` (no violations) or `violation_<kind>/`
(one specific violation, focused).

## Layout per fixture

```
<scenario>/
├── MANIFEST.yaml          # describes the scenario (auditor + violation_kind + expected fields)
└── <repo-tree>/           # files the auditor reads (mimics repo layout)
```

## MANIFEST.yaml shape

```yaml
gatekeeper: architecture-auditor   # which agent
expects:
  verdict: FAIL                    # PASS | WARN | FAIL
  severity: BLOCKER                # the highest-severity finding expected
  rule: no_atomic_to_atomic_calls  # the deterministic-runner rule key
  cite_file: services/atomic/foo/main.py   # path that must appear in findings
  cite_line: 42                    # optional
  message_contains: "another atomic-service URL"   # optional substring
```

## Rules for fixtures

1. **Minimal**. A violation fixture should contain only the files needed to
   trigger the violation. Keep them small so tests are fast and focused.
2. **Realistic**. Files should look like real repo files, not contrived stubs.
   The auditor must be able to recognize the pattern as it would in production.
3. **One violation per fixture**. Layered violations confuse what's being tested.
4. **Real paths**. Use the canonical layout (`services/atomic/<svc>/main.py`,
   `usecases/<uc>/handler/main.py`, etc.).
5. **Deterministic content**. No timestamps, UUIDs, or env-dependent values.
