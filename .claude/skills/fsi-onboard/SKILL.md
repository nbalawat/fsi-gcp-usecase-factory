---
name: fsi-onboard
description: Structured intake interview that produces a comprehensive 14-section brief (usecases/<uc>/brief.yaml) describing every aspect of a banking use case — problem framing, stakeholders, process + state machine, data sources, atomic services, rules, agent operating envelope (decision-points table, stage envelopes, response_schema sketches), sinks, HITL gates, console pattern, compliance, model selection, SLOs + risks + rollback, MVP phasing, predecessor migration, adjacent UCs, glossary, and an auto-generated reuse map + economics projection. Replaces the legacy lightweight onboarding canvas. Branches the question set on console pattern + regulatory scope. Suggests reuse from existing factory in real time. Hard-gates save until schema + word-count validation pass. Conversational pacing (~30-45 min, ~25-40 questions via AskUserQuestion).
disable-model-invocation: true
allowed-tools: Read, Write, Edit, AskUserQuestion, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, find:*, grep:*, node:*, python3:*, git:*)
---

You are running the bank's **comprehensive intake interview** for a new use case. Goal: prevent the "4-line use case description produces a vague 4-line product" failure mode. By the end of this skill, the user has a `usecases/<uc>/brief.yaml` so detailed and structured that every downstream skill (`/fsi-design-proposals`, `/init-use-case`, `/new-use-case`, builder agents) can be driven by it without further interpretation.

This replaces the legacy `/fsi-onboard` that produced a lightweight `onboarding/<uc>.yaml` canvas. The brief now lives at `usecases/<uc>/brief.yaml`; the legacy canvas is auto-derived for backward compatibility.

## Inputs

- `$ARGUMENTS` — kebab-case use case id (e.g. `mortgage-origination`). If omitted, the first question asks for it.

## Pre-flight (~1 min)

1. If `$ARGUMENTS` is missing or not kebab-case, ask via AskUserQuestion before doing anything else.

2. **Detect prior state.** Run these checks:

   ```bash
   ls usecases/<uc>/brief.yaml 2>/dev/null            # already-completed brief?
   ls usecases/<uc>/.intake-draft.yaml 2>/dev/null    # in-progress draft?
   ls onboarding/<uc>.yaml 2>/dev/null                # legacy canvas?
   ```

   Then branch:

   - **brief.yaml exists** — ask: "I see a completed brief for this UC. (a) re-interview from scratch, (b) edit specific sections, (c) just view it. Default = view."
   - **.intake-draft.yaml exists** — ask: "I see an in-progress draft. Resume from where you left off, or restart? Default = resume."
   - **onboarding/<uc>.yaml exists (legacy)** — say: "I see a v1 canvas. I'll upgrade it to the new brief format: I'll pre-fill what I can from the canvas and only ask about the new sections (data lineage, agent envelope, etc.). About 15–20 minutes."
   - **None exist** — say: "Greenfield UC. Full intake, ~30–45 minutes."

3. **Load supporting files** (in memory):

   - `.claude/skills/fsi-onboard/assets/brief-schema.json` — to know required fields
   - `.claude/skills/fsi-onboard/assets/question-bank.yaml` — the question script
   - `.claude/skills/fsi-onboard/assets/section-examples/` — markdown examples for the 3 hard sections (agent-envelope, data-lineage, compliance-citations)
   - `libraries/personas/*.yaml` — persona library (for Round 2)

## Round 0 — capture any pre-existing input + identifier

If the sponsor pastes a description (Q0), measure word count:

- `<100` words → terse → run the full question set
- `100–500` words → medium → skip questions the text already answers (you decide per-question; default to asking if uncertain)
- `>500` words → rich → gap-fill mode: extract what you can, ask only what's missing

Persist what they pasted into `ingested_input.raw_text` with `richness` + `ingested_at`.

## Rounds 1–14 — walk the question bank

Walk `question-bank.yaml` top-to-bottom. For each question:

1. **Evaluate `ask_when`.** If it references prior answers (e.g. `process.console_pattern != "real-time"`), evaluate against the running answer set. Skip if false.
2. **Render the `prompt`.** Use AskUserQuestion for single questions; for multi-item structured answers (state machine stages, data sources, etc.) use a single open-ended AskUserQuestion that captures multi-line text, then parse client-side.
3. **Check the answer.**
   - If `ask_mode == open` and `wordCount(answer) < probe_threshold`: probe with `probe_followups`. Do up to 2 follow-up rounds before accepting. If the answer is still thin after 2 probes, save it but flag in a `weak_answers[]` list for end-of-interview review.
   - If `example_ref` is set and the user looks stuck (asks for help, provides "I don't know", etc.), print the section example markdown inline.
4. **Reuse suggestion (live).** After capturing answers in `q5_atomic_services`, `q6_rules`, `q7_agent_sketches`, `q10_moments_of_truth`:
   - Call `node scripts/scan_factory_for_reuse.mjs <partial-brief-path>` with the partial draft.
   - Show user: "Based on what you described, here are existing factory components that match. Adopt any of these?" Present the top 5 candidates with confidence scores via AskUserQuestion (multiSelect).
   - For each adopted candidate, update the corresponding brief entry's `reuse_status` and `existing_service_path` / `archetype_id`.
5. **Autosave after every answer.** Write `usecases/<uc>/.intake-draft.yaml` so the sponsor can resume if interrupted.

### Branching (per the discipline answers locked in design):

- After Q3 (`console_pattern` + `process_area`) you know the UC shape. Use it to skip:
  - `q9_hitl_gates` if `console_pattern == "real-time"` (already gated by `ask_when`).
  - Treasury / wealth-specific questions if `process_area` isn't in those domains.
  - Detailed regulatory questions if `compliance.scope == lightweight`.

- Always ask the 14 mandatory sections regardless of branching. Branching reduces depth, not breadth.

## Round 15 — reuse map + economics projection (auto)

After every question is answered:

1. Run `node scripts/scan_factory_for_reuse.mjs usecases/<uc>/.intake-draft.yaml` to get the reuse-map + economics. Stamp both into the draft.
2. Show the user the auto-generated section:
   ```
   ── Reuse map ──
     Atomic service reuse: 4/5 (80%)
     Agent archetype reuse: 2/3 (67%)
     Top candidates to review:
       - peer-and-industry-context (atomic-service) matches your `peer_curator` agent_sketch
       - covenant-designer (agent-archetype) matches your `covenant_decision` decision_point
   ── Economics projection ──
     Projected cost / case: $0.07
     Projected p99 wall-time: 8500ms
     Cost ceiling you set: $0.10  ✓ on track
     p99 budget you set: 10000ms  ✓ on track
   ```
3. Ask: "Anything you want to revise based on this projection?" Loop back to specific sections if user wants edits.

## Round 16 — validation gate (HARD)

Before saving the canonical brief, run:

```bash
node scripts/validate_brief.mjs usecases/<uc>/.intake-draft.yaml
```

Examine the JSON output:

- **All passes (exit 0):** proceed to save.
- **Schema errors (exit 1):** list each `structural_errors[]` entry; loop back to the responsible question. Re-validate.
- **Word-count / stub errors (exit 2):** list each `prose_errors[]` entry; re-prompt with: "This answer was too thin / placeholder-shaped. Give me at least N more words about X." Re-validate.

The brief.yaml does NOT save until exit 0.

## Round 17 — save + derive

When validation passes:

1. Move `usecases/<uc>/.intake-draft.yaml` → `usecases/<uc>/brief.yaml`.
2. Stamp `last_modified` + `last_modified_by` (use git config user.email if available).
3. Render markdown: `node scripts/render_brief_md.mjs usecases/<uc>/brief.yaml` → produces `usecases/<uc>/brief.md` with the Mermaid state-machine diagram.
4. Derive legacy canvas: `node scripts/derive_legacy_canvas.mjs usecases/<uc>/brief.yaml` → produces `onboarding/<uc>.yaml` (backward-compat for `/init-use-case` + `/fsi-design-proposals`).
5. Create the `.clarifications/` directory: `mkdir -p usecases/<uc>/.clarifications/` — this is where downstream skills drop gap notes (the brief itself stays sponsor-owned).

## Round 18 — close the loop

Print the closing summary:

```
✓ Brief saved: usecases/<uc>/brief.yaml
✓ Markdown rendered: usecases/<uc>/brief.md (with state-machine diagram)
✓ Legacy canvas derived: onboarding/<uc>.yaml
✓ Validation: 14/14 required sections green; 0 schema errors; 0 stub-content errors

Reuse summary:
  - Atomic services: 4/5 reused (80%)
  - Agent archetypes: 2/3 reused (67%)
  - Net-new components requiring justification: ar-aging-classifier (atomic-service)

Cost projection: $0.07 / case (under $0.10 ceiling ✓)
Latency projection: p99 8.5s (under 10s budget ✓)

Next steps:
  1. Eyeball usecases/<uc>/brief.md — it's the artifact every downstream skill consumes.
  2. /fsi-design-proposals <uc> — spawn 4 designer agents to produce 4 UX prototypes.
  3. Or: review the brief with your team and re-run /fsi-onboard <uc> to revise.

Weak answers flagged for follow-up (optional):
  - problem.success_metrics[2] — baseline was "vague"; you may want a sharper number
  - ...
```

## Errors & recovery

| Symptom | Cause | Recovery |
|---|---|---|
| Python3 not available | parsing helper missing | install python3 + PyYAML; or shim the YAML parser |
| `libraries/personas/<id>.yaml` not found | sponsor referenced a persona id that doesn't exist | offer to: (a) pick a different library id, (b) inline-author a new persona that gets added to library after this UC ships |
| Validation fails on stage state-machine | unparseable structured input | re-ask the question and remind format `stage_id \| name \| trigger \| exit_condition` |
| Sponsor wants to revise after save | brief is mutable | re-run `/fsi-onboard <uc>`; skill detects existing brief and offers re-interview / per-section-edit / view options |

## Skill output contract (for downstream skills)

After this skill completes successfully:

- `usecases/<uc>/brief.yaml` exists, conforms to brief-schema.json, passes validate_brief.mjs.
- `usecases/<uc>/brief.md` is in sync with brief.yaml (regenerated each save).
- `onboarding/<uc>.yaml` is the auto-derived legacy-shape canvas (still readable by old skills).
- `usecases/<uc>/.intake-draft.yaml` is removed after successful save (intentionally — no half-states left behind).
- `usecases/<uc>/.clarifications/` exists (empty), ready for downstream skills to drop notes.

Downstream skills can rely on the brief being fully populated, validated, and stable. They do not need to re-interview the sponsor.

## What this skill DOES NOT do

- It does not author code (handler, atomic services, agents, etc.). That's `/init-use-case`, `/new-use-case`, and the builder agents.
- It does not produce UX designs. That's `/fsi-design-proposals`.
- It does not validate regulatory citations. That's the compliance-reviewer subagent (called by `/review-uc`).
- It does not deploy anything to GCP. That's the deploy scripts.
- It does not write tests. That's the test-author subagent.

The brief is the spec. Everything else is downstream.

## See also

- `docs/methodology/brief-authoring.md` — sponsor-facing guide explaining what each section means and what good looks like.
- `.claude/skills/fsi-onboard/assets/brief-schema.json` — strict schema; the source of truth for validation.
- `.claude/skills/fsi-onboard/assets/question-bank.yaml` — every question this skill asks, in order, with branching rules.
- `libraries/personas/` — persona library, referenced by `stakeholders.personas[].library_id`.
