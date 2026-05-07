---
name: fsi-reasons-canvas
description: Author or update a use case's REASONS canvas (Requirements / Entities / Approach / Structure / Operations / Norms / Safeguards). The canvas is the spec; code is mechanically derived from it.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*)
---

You are authoring or updating a use case's REASONS canvas — `usecases/{use_case}/reasons.yaml`. The canvas is the **contract**: code is generated from it; reviews are against it; compliance docs export from it.

## When to invoke

- During `/init-use-case` — author the initial canvas with placeholder Operations.
- After `/new-use-case` Steps 1–6 — fill in Requirements, Entities, Approach, Structure with real content.
- During development — update Operations as the build progresses.
- When making behavior changes — `/fsi-prompt-update` updates the canvas first, then regenerates affected code.

## The seven sections (in order)

The full schema lives at `policies/reasons_schema.json`. Detailed authoring guidance for each section is in `references/section_specs.md`. Summary:

| Section | Purpose | Example |
|---|---|---|
| **R**equirements | Problem, definition of done, regulatory regime, latency budget | "Approve commercial credit memo within 48h…" |
| **E**ntities | Domain model + relationships | Borrower, Loan, FinancialStatement, PeerSet |
| **A**pproach | Solution strategy + tradeoffs | `pipeline-originator@1.2` archetype + `extractor-spreader-rater-drafter@1.1` pattern |
| **S**tructure | Components + dependencies (versioned references to libraries) | Handler + 8 atomic services + 1 supervisor + 3 specialists + 6 fragments + 1 console |
| **O**perations | Buildable units (one Operation = one builder input). Each carries `layer: 1\|2\|3\|4`. | "Build atomic service `dscr-calculator`" — fed to atomic-service-builder |
| **N**orms | Cross-cutting standards (inherits from CLAUDE.md) | "Models: Opus 4.7 + Gemini 3.1 Flash only", "Memo prose ≤1500 words" |
| **S**afeguards | Non-negotiable invariants | "No PII in agent prompts", "DSCR computation deterministic", "48h regulatory clock", "$3 cost ceiling" |

For section-by-section authoring (Operations layering, Structure version pins, library references) read `references/section_specs.md`.

## Authoring workflow

1. **Read the diagnostic answers** the user provided in `/new-use-case` (or copy them from the conversation if invoked standalone).
2. **Search the libraries** before writing Structure — every entry should be a versioned reference to an existing library archetype/pattern/fragment, OR a new operation marked for build.
3. **Write Operations such that the dependency DAG is clear**. Layer 1 = no deps; Layer 2 = depends on Layer 1 manifests; Layer 3 = depends on Layer 2 contracts; Layer 4 = independent (can run anytime).
4. **Validate** — `python3 scripts/resolve_reasons_refs.py usecases/{uc}/reasons.yaml`. Confirms every Structure reference resolves.
5. **Architecture-auditor** runs against the canvas and detects drift between Operations and existing artifacts.

## The two-path correction protocol (hard rule)

| Change type | Path | How |
|---|---|---|
| **Behavior change** (new threshold, different agent tool, model swap, prompt edit) | **Prompt-first.** Edit REASONS → regenerate affected code. | `/fsi-prompt-update <uc>` opens REASONS, walks the change, identifies affected Operations, re-runs only those builders. |
| **Pure refactor** (rename, extract function, restructure, no behavior change) | **Code-first.** Edit code → sync REASONS to current reality. | `/fsi-sync <uc>` re-derives Structure from current code, diffs against REASONS, proposes updates for human approval. |

Any commit changing runtime behavior MUST update REASONS in the same PR. The architecture-auditor blocks the commit if Operations and generated artifacts diverge.

## Anti-patterns to refuse

- Writing the canvas in free-form prose. Use the schema sections.
- Skipping `Operations` `layer` annotations — the parallel-build orchestrator can't run without them.
- Library references without `@version` pins.
- Manually editing generated code without updating REASONS first (behavior changes are prompt-first).
- Citing libraries that don't exist — every Structure reference must resolve to a real `libraries/<layer>/<name>/archetype.yaml`.

## Compliance pack export

`/compliance-pack` exports REASONS sections directly into the SR 11-7 model card:

| SR 11-7 expectation | REASONS section |
|---|---|
| Statement of model purpose | R |
| Conceptual soundness | A |
| Implementation overview | S |
| Boundary conditions / limitations | Safeguards |
| Governance and ongoing monitoring | Norms (inherited) + Safeguards |

This eliminates second-source compliance documentation drift.
