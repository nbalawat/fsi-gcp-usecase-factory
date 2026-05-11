# archives/design-tests/

Long-lived test-run artifacts from the UX-first validation tiers.

`archives/design/` holds the audit trail of designs that actually shipped
to a use case. **This directory holds tests of the factory itself** —
runs that exist only to validate the design-generation pipeline before we
hand it to 100 people. Same forever-archive semantics; same auditor
protections.

## Layout

```
archives/design-tests/
├── README.md                                  ← this file
├── .gitkeep
├── <ISO-timestamp>-<uc>-runN/                 ← one directory per test run
│   ├── meta.yaml                              ← { use_case_id, canvas_sha256, tier, generated_at }
│   ├── judge-report.json                      ← Phase 0.1 judge output
│   ├── option-A/ … option-D/                  ← full option trees with manifest.yaml
│   ├── url.txt                                ← deployed URL if still up
│   └── trial-notes.md                         ← Tier 4 observer notes (only for trial runs)
└── _meta/<ISO-timestamp>/                     ← /fsi-design-proposals meta-comparator outputs
    ├── _meta_review.html                      ← cross-run side-by-side comparator
    └── analysis.json                          ← machine-readable cross-run stats
```

## The four validation tiers

Each test run is tagged with a `tier` in its `meta.yaml`:

| Tier | What it answers | Cost / time |
|---|---|---|
| **1.** Single live run | "Does the chain produce 4 working prototypes end-to-end on a real UC?" | ~$10 / 30 min |
| **2.** Multi-UC coverage | "Does the pattern hold across all 6 console patterns?" | ~$60 / 3 hrs |
| **3.** Variance | "If two builders run the same canvas, how much does output diverge?" | ~$30 / 90 min |
| **4.** Trial | "Can a non-author follow the journey unaided?" | observer time |

A passing pipeline is one where:
- Tier 1: 4/4 options compile + deploy; judge composite ≥3.5 on at least 3
- Tier 2: same as Tier 1, but across 6 canvases (one per console pattern)
- Tier 3: same-axis consistency ≥0.5; cross-axis divergence ≤0.4
- Tier 4: trial completes without intervention; doc updates triggered by friction land before rollout

## Rules

- Files in this tree are **append-only**. Nothing is ever modified.
  The architecture-auditor fails any commit that deletes or modifies an
  existing file under `archives/design-tests/`.
- Subdirectories are named `<ISO-timestamp>-<uc>-run<N>`.
- The `_meta/` subtree holds meta-comparator outputs; each meta-comparator
  invocation produces a fresh timestamped directory.
- No human-edited files except `trial-notes.md` during Tier 4 runs.

## When to grep

- "Show me every test run on a real-time UC" →
  `grep -r 'use_case_id:.*real-time' archives/design-tests/*/meta.yaml`
- "Has the judge ever picked option-D as winner?" →
  `grep -l '"recommended_winner": "D"' archives/design-tests/*/judge-report.json`
- "Across all variance runs, what's the typical density distribution?" →
  `grep -r 'density_score:' archives/design-tests/*/option-*/manifest.yaml | sort | uniq -c`

## Cleaning up

You almost never should. Test runs are evidence we ran the validation.

If a test run was an obvious smoke-test stub (use_case_id starts with `__test_`):
clean it up at the end of the test driver script. Real test runs stay.

Production / staging will eventually want a retention policy
(e.g. trim Tier 1+2 runs older than 1 year, keep all Tier 4 trial runs
forever). For dev, keep everything.
