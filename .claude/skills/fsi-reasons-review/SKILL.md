---
name: fsi-reasons-review
description: Intent-alignment review of a use case at the R / E / A / S level. Distinct from /review-uc which is implementation-level (test coverage, security, compliance pack completeness).
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(git:*, ls:*, cat:*)
---

You are reviewing a use case's REASONS canvas for intent alignment, before any implementation review. The two reviews complement each other:

- `/fsi-reasons-review` → does the canvas describe a coherent, buildable use case? (this skill)
- `/review-uc` → does the implementation match the canvas + pass arch / security / compliance gates?

## Step 1 — Identify the use case

From `$ARGUMENTS` or current branch.

## Step 2 — Read the REASONS canvas

Open `usecases/<uc>/reasons.yaml`. Confirm all 7 sections are present (R / E / A / S / O / N / S).

## Step 3 — Requirements review (R)

Check:

- **Problem statement** — one sentence, business-meaningful (not just "build a service that ...")
- **Definition of done** — measurable outcome (a memo approved within 48h; a fraud decision in < 200ms; etc.)
- **Trigger** — concrete event source (Pub/Sub topic, schedule, webhook)
- **Primary user** — a real human role (credit officer, fraud analyst, AML investigator), not "the system"
- **Regulatory regime** — listed regulations are real (BSA, OCC 12 CFR 32, Reg O 12 CFR 215, ASC 326, etc.)
- **Latency budget** — appropriate for the use case (sub-second / hours / days)
- **Console pattern** — matches the time-horizon × unit-of-work mapping in `docs/methodology/console_reference.md`

Common Requirements smells:
- Vague outcomes ("improve credit decisioning")
- Missing trigger
- Console pattern mismatch (a multi-day flow with a real-time console)

## Step 4 — Entities review (E)

Check the domain model:

- **Entities listed** — Borrower, Loan, FinancialStatement, etc. — are they real domain objects?
- **Relationships** — for each entity pair, is the cardinality stated? (one borrower has many loans; one loan has many covenants)
- **PII fields flagged** — borrower_id, EIN, SSN, addresses — are they marked as PII? (drives downstream redaction)

## Step 5 — Approach review (A)

The Approach section should declare:

- **Use-case archetype** with version pin (`pipeline-originator@1.2`, `real-time-scorer@1.0`)
- **Multi-agent pattern** if applicable (`extractor-spreader-rater-drafter@1.1`)
- **Tradeoffs** explicitly stated — what's being optimised for at the expense of what

Reject if:
- Library references don't resolve (`libraries/use-cases/<archetype>/archetype.yaml` doesn't exist at that version)
- Archetype is plausible but description doesn't match the use case's domain
- Tradeoffs are absent (every approach has tradeoffs; refusing to state them = reviewer can't push back)

## Step 6 — Structure review (S)

Walk every Structure reference:

- **Atomic services**: each `name@version` resolves to a real `services/atomic/<name>/` with that version in its manifest
- **JDM rules**: same for `rules/<name>/v<ver>.json`
- **Agent archetypes**: `libraries/agents/<name>/archetype.yaml` exists at version
- **Multi-agent pattern**: `libraries/patterns/<name>/pattern.yaml` exists
- **Workflow fragments**: `libraries/workflows/<name>/fragment.yaml.j2` exists
- **Use-case archetype**: `libraries/use-cases/<archetype>/archetype.yaml` exists

Run `python3 scripts/resolve_reasons_refs.py usecases/<uc>/reasons.yaml --strict`. Refuse the canvas if any reference fails to resolve.

Then check internal coherence:
- Number of atomic services ≈ what the chosen pattern needs
- Sinks listed match the use case's "definition of done" (a memo UC has a memo-store sink; a fraud UC has a scoring sink)
- Memory scope on the supervisor agent is one of: `borrower_id`, `customer_id`, `case_id`, `session_id` (or `none` for stateless)

## Step 7 — Operations review (O)

Operations drive the parallel-build orchestrator. Check:

- Every Operation has a `layer` (1 / 2 / 3 / 4) — required for the DAG
- Every Operation has a `path` (where the artifact lives) and a `kind` (which builder)
- Layer 1 operations are independent (no cross-references); Layer 2 depends on Layer 1 manifests; etc.
- Number of Operations is realistic — a single UC with 50+ Operations smells like over-decomposition

## Step 8 — Norms review (N)

Norms inherit from `CLAUDE.md`. Per-UC additions should:
- Not contradict global norms (models, ingress, encryption)
- Be measurable (e.g. "memo prose ≤ 1500 words" — not "memo prose should be concise")

## Step 9 — Safeguards review (S)

Each Safeguard must be:
- A non-negotiable invariant (not a goal)
- Mechanically verifiable (tested by gatekeepers / OPA / runtime asserts)
- Specific (not "secure data" — instead "no PII in agent prompts; gatekeeper test enforces")

Common Safeguard smells:
- Aspirational language ("strive to", "best effort")
- Untestable claims ("ensure data quality")
- Missing cost ceiling (every UC should have a per-decision cost cap)
- Missing regulatory clock if regime requires one

## Step 10 — Render verdict

```
REASONS review — <use_case>

R / Requirements:    PASS / WARN / FAIL — <comment>
E / Entities:        PASS / WARN — <comment>
A / Approach:        PASS — archetype <ref>, tradeoffs explicit
S / Structure:       PASS — <N> refs, all resolve at pinned versions
O / Operations:      PASS — <N> ops across 4 layers
N / Norms:           PASS — inherits CLAUDE.md, 2 UC-specific
S / Safeguards:      WARN — missing cost ceiling
                            ↳ add: cost_per_decision_max_usd: 3.00

Verdict: GO with one revision (add cost ceiling)
```

## Anti-patterns to refuse

- Reviewing implementation in this skill (use `/review-uc` for that)
- Stamping FAIL without a specific actionable comment
- Reviewing without resolving every Structure reference
- Skipping Safeguards review for "well-understood" use cases — every UC needs explicit invariants
