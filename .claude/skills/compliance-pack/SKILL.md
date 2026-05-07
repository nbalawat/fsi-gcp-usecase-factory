---
name: compliance-pack
description: Generate the SR 11-7 compliance pack for a use case (model card, decision rationale, audit trail, signatures, citations). Run after the use case is built and before /promote.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*)
---

You are generating the compliance pack for a use case. The pack is what compliance and MRM teams review before approving production deployment.

## Why this matters

Banks need formal compliance documentation per SR 11-7 (model risk management) and per use-case-specific regulations (BSA, Reg E, CFPB, OCC, CECL, etc.). The factory generates the pack from templates with use-case-specific content; the user (with compliance team) refines and signs off.

Output location: `usecases/{use_case}/compliance/`.

## Step 1 — Identify the use case

If `$ARGUMENTS` provides the use case ID, use it. Otherwise infer from the current branch / changed files. Confirm with the user.

## Step 2 — Read the use case context

Gather inputs the templates need:

- `usecases/{uc}/reasons.yaml` — REASONS canvas (the contract)
- `usecases/{uc}/docs/spec.md`, `dependencies.yaml`, `slos.yaml`
- `usecases/{uc}/agents/manifest.yaml`, `agents/prompts/*.md`
- `usecases/{uc}/rules/**/*.json` (use-case rules)
- `rules/**/*.json` (shared regulatory rules referenced by the UC)
- `usecases/{uc}/handler/main.py`, `usecases/{uc}/workflow.yaml`

Read all. The compliance pack synthesizes from these — never invent content.

## Step 3 — Identify the regulatory regime

Ask the user (or infer from `reasons.yaml` requirements): which frameworks apply?

- BSA / FinCEN (AML, SAR)
- Reg E / Reg Z (consumer payments, disclosures)
- CFPB (complaints, fair lending)
- SCRA / FDCPA (collections)
- SR 11-7 (model risk — required for any consequential agent decisioning)
- TRID, Fannie/Freddie/Ginnie (mortgage)
- UCP 600 (trade finance)
- FFIEC (regulatory reporting)
- OCC heightened standards; 12 CFR Part 30 / 32 / 215 (national bank lending limits + Reg O)
- CECL / ASC 326-20 (provisioning)

Different regimes need different artifacts. SR 11-7 is mandatory for any agentic decision.

## Steps 4–9 — Generate each artifact

For each artifact, read the template at `references/template_<name>.md`, fill in `{placeholders}` from the use case context (Step 2), and write to `usecases/{uc}/compliance/<name>.md`.

| Step | Output file | Template |
|---|---|---|
| 4 | `model_card.md` | `references/template_model_card.md` |
| 5 | `decision_rationale.md` | `references/template_decision_rationale.md` |
| 6 | `audit_trail_spec.md` | `references/template_audit_trail_spec.md` |
| 7 | `sr_11_7_documentation.md` (if agent decisioning) | `references/template_sr_11_7.md` |
| 8 | `signatures_required.md` | `references/template_signatures.md` |
| 9 | `regulatory_citations.md` | `references/template_regulatory_citations.md` |

For step 5, generate one `## Decision:` section per decision the rules + agents make.
For step 9, list each rule + agent decision with its specific regulatory citation. **Never fabricate citations** — if the user doesn't know which regulation governs a rule, ask them.

## Step 10 — Report

```
✓ Compliance pack generated at usecases/{uc}/compliance/:
    - model_card.md
    - decision_rationale.md
    - audit_trail_spec.md
    - sr_11_7_documentation.md (if agent decisioning)
    - signatures_required.md
    - regulatory_citations.md

NEXT STEPS:
  1. Have the model owner review model_card.md and sign off
  2. Submit sr_11_7_documentation.md to MRM for independent validation
  3. Have compliance review decision_rationale.md
  4. Collect signatures per signatures_required.md
  5. Once signed, run /promote
```

This pack is a starting point. Compliance and MRM teams will request edits — that's expected. Iterate.

## Anti-patterns to refuse

- Generating sign-offs (only humans sign).
- Skipping SR 11-7 documentation for agent-decisioning use cases.
- Fabricating regulatory citations (if the user doesn't know, ask them).
- Generating performance metrics without real measurements (mark as "to be measured").
- Conflating 12 CFR Part 32 (LLL) with 12 CFR Part 215 / Part 31 (Reg O insider lending). These are distinct regulations for distinct decisions.
