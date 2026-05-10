---
name: fsi-onboard
description: Guided 7-round onboarding journey for a new use case. Uses AskUserQuestion at every decision so the user picks from LIBRARY shapes (use-case archetype, multi-agent pattern, agent archetypes, atomic services, rules, workflow fragments) instead of building net-new code. Emits onboarding.yaml that pre-seeds /init-use-case + /new-use-case. Hard-gates reuse rate (≥80% atomic, ≥70% agents) before scaffolding runs.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, AskUserQuestion, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, find:*, grep:*, node:*, python3:*)
---

You are running the bank's guided onboarding journey for a NEW use case. Your goal is to **prevent service / agent / rule proliferation** by walking the user through structured library-first decisions. Defaults always favour reuse; net-new code requires an explicit justification string captured into the canvas.

This skill runs BEFORE `/init-use-case`. Output is `onboarding/<use_case>.yaml` which `/init-use-case` and `/new-use-case` consume to pre-seed `reasons.yaml`.

---

## Inputs

- `$ARGUMENTS` — kebab-case use case id (e.g. `mortgage-origination`). If omitted, ask for it as the very first question.

## Pre-flight

1. Confirm `$ARGUMENTS` is a valid kebab-case identifier; reject anything containing `_`, spaces, or capitals.
2. Refuse to proceed if `usecases/<use_case>/` already exists with `reasons.yaml`. Tell the user: "This UC already has a canvas. Use `/fsi-prompt-update <uc>` for behavior changes or `/fsi-sync <uc>` for refactors." Stop.
3. Inventory the libraries — read these directories AT RUNTIME (do not assume from training memory; the catalog evolves):

   ```bash
   ls libraries/use-cases/      # 6 archetypes today
   ls libraries/patterns/       # 5 multi-agent patterns today
   ls libraries/agents/         # 14 agent archetypes today
   ls libraries/workflows/      # 8 fragments today
   ls services/atomic/          # 12 atomic services today
   find rules -maxdepth 2 -name 'v*.json' -not -path '*/tests/*' | head -40
   ```

   The exact lists you observe are what you offer in the AskUserQuestion options below.

4. Read `docs/methodology/factory-cookbook.md` and `docs/methodology/product-build-discipline.md` for context. You will reference cookbook patterns and discipline rules in your guidance text inside each round.

5. Read `docs/methodology/onboard-new-use-case.md` for the existing pitfalls list (you will surface relevant ones inline as guidance).

---

## Round 1 — Console pattern (which UI shape)

Read `docs/methodology/console_reference.md`. The six patterns are exhaustive; this question has no "build a new console" option.

Use `AskUserQuestion` with:
- `question`: "What is the dominant UX shape for this use case? (This drives `usecases/<uc>/ui/console.yaml` and the route host under `ui/apps/<pattern>-console`.)"
- `header`: "Console"
- `options` (4 best-fit; use the cheat-sheet below to pick which 4 surface):

  | Pattern | One-line cue |
  |---|---|
  | real-time | sub-second, throughput-dominant, fraud / payment scoring |
  | investigations | case-level, regulatory clock, BSA / SAR / disputes |
  | pipeline | multi-day flow through stages, originations, applications |
  | surveillance | 2D state grid, continuous re-eval (concentration, watchlists) |
  | run | periodic exercise toward a deadline (CECL, stress test) |
  | recommendations | agent suggestions queued for human disposition (cross-sell, NBA) |

  Pre-rank the options based on signals in the use-case name + the user's `$ARGUMENTS`. If you see "originat", "memo", "loan", "application" → put `pipeline` first; "fraud", "score", "real-time" → put `real-time` first; "investigat", "complaint", "BSA" → put `investigations` first; etc.

Capture the answer as `console_pattern`.

---

## Round 2 — Use-case archetype (whole-shape reuse)

The 6 archetypes in `libraries/use-cases/` map onto the 6 console patterns 1:1 (see each archetype's `archetype.yaml: console_pattern` field). The user almost always wants the matching archetype.

Use `AskUserQuestion`:
- `question`: "Start from a use-case archetype, or build the structure yourself? (Archetypes pre-wire the workflow fragments + the multi-agent pattern + the approval gate. Building from scratch costs ~2x more across handler / workflow / sinks and creates drift risk per discipline rule #6.)"
- `header`: "Archetype"
- `options` (3):
  1. `Use archetype: <name>@<version>` (Recommended) — pulled from the matching archetype for the chosen `console_pattern`. Description names the bundled fragments (e.g. "fan-out-join + agent-call-with-retry + approval-gate + sink-fanout").
  2. `Use a different archetype` — only if the user's domain doesn't fit the console-implied default.
  3. `Build from scratch (REQUIRES JUSTIFICATION)` — picks no archetype; the user must write a one-line justification when prompted.

If the user picks option 3, follow up with `AskUserQuestion`:
- `question`: "Why does no archetype fit? (Captured into `onboarding.yaml: archetype_skip_justification` and surfaced in `/review-uc`.)"
- `options`: 4 short reasons (novel decision shape / novel data flow / multi-region requirement / other) — they pick OR write a custom one-liner.

Capture as `use_case_archetype` (string or `null`) + optional `archetype_skip_justification`.

---

## Round 3 — Decision shape + HITL gates

Read the chosen archetype's `archetype.yaml: required_libraries.workflow_fragments` for the default callback/approval shape. Most archetypes ship with `approval-gate@1.0` once. The cookbook (Pattern 1) shows credit-memo's 4 callbacks (extraction_review / rating_review / draft_review / final_approval).

Use `AskUserQuestion`:
- `question`: "Where do humans need to approve / review / sign? (Each gate adds an `events.await_callback` step + a Cloud SQL `human_actions` row + a HITL action bar in the UI. Each one costs UX surface and operational toil — only add gates the regulator or policy actually requires.)"
- `header`: "HITL gates"
- `multiSelect`: true
- `options` (4):
  1. `Final approval only (Recommended)` — one gate at the end. The default for run / scoring / recommendation UCs.
  2. `Review checkpoint + final approval` — two gates. Right when an analyst needs to sanity-check before the rating model runs.
  3. `Per-stage review (4 gates)` — extraction / rating / draft / final. Right for high-stakes underwriting (credit memo).
  4. `No HITL (advisory output)` — zero gates. Output is informational; humans never block.

If the user picks 3 (4 gates), surface the `useCheckpointAction + DoneChip + router.refresh()` cookbook pattern (Pattern 1) and Rule 30 ("HITL action bars must `router.refresh()` + 404-as-success") so they don't repeat the bug we paid for.

Capture as `hitl_gates: [list of gate names]`.

---

## Round 4 — Atomic-service composition (the hardest gate)

This round prevents Layer-1 proliferation. The 12 services in `services/atomic/` cover most banking compute; building a 13th is rare.

Step 4a — Show the inventory with descriptions. Read each `services/atomic/<name>/manifest.json` for the description.

Step 4b — Use `AskUserQuestion`:
- `question`: "Which existing atomic services does this use case need? (Tick everything that applies. Choose generously — workflow composition is cheap; building a new service costs ~3 days + a Cloud Run service + a manifest + tests + Terraform module reuse + IAM. Per discipline rule #11, atomic services NEVER call other atomic services — composition belongs in the workflow.)"
- `header`: "Atomic services"
- `multiSelect`: true
- `options` (up to 4 most relevant for the inferred domain — pre-rank based on UC name; surface the rest under "Other → list all"):
  - For credit-style UCs: `financial-spreader`, `loan-serviceability`, `peer-and-industry-context`, `borrower-network`
  - For fraud/scoring: `industry-risk-scorer`, `peer-and-industry-context` (and document-extractor only if upstream involves PDFs)
  - For investigations: `borrower-network`, `peer-and-industry-context`
  - For surveillance: `exposure-aggregator`, `peer-benchmarker`

Step 4c — Ask whether ANY net-new atomic services are needed.

`AskUserQuestion`:
- `question`: "Do you need any net-new atomic services beyond the library? (Net-new is rare and gated — say no unless you're certain a fundamentally new compute primitive is required. Rule of thumb: if your service would call another atomic service, it's a workflow, not a service.)"
- `options`: `[{label: "No, library is sufficient (Recommended)"}, {label: "Yes, one or more net-new"}]`

If yes, follow up with a free-form `AskUserQuestion` per net-new service capturing: name, one-line description, why it can't be a sub-routine inside an existing service. Each gets a `justification` field in `onboarding.yaml: net_new_atomic_services[]`.

Capture as:
```yaml
atomic_services_reused: [list of names]
net_new_atomic_services:
  - name: <kebab>
    description: <one-line>
    justification: <why a library service won't work>
```

**Reuse-rate computation**:
`reuse_rate_atomic = len(reused) / (len(reused) + len(net_new))`. If `<0.80`, halt and surface a refusal panel offering `/fsi-promote-to-library` or asking the user to revisit Round 4.

---

## Round 5 — Multi-agent pattern + agent archetypes

Read the chosen use-case archetype's `archetype.yaml: required_libraries.multi_agent_patterns` for the default. Read the matching pattern's `pattern.yaml: composes` to see which roles + archetypes it bundles.

Step 5a — `AskUserQuestion`:
- `question`: "Which multi-agent pattern fits the agent loop? (Patterns from `libraries/patterns/` pre-wire role + supervisor + handoff. Picking a pattern saves ~5 days of orchestration code per UC.)"
- `header`: "Pattern"
- `options` (4):
  1. The archetype's bundled pattern (Recommended) — e.g. `extractor-spreader-rater-drafter@1.0` for `pipeline-originator`. Description names the roles.
  2. `classifier-extractor-decider@1.0` — when there's no narrative output (just a decision)
  3. `triage-investigator-narrator@1.0` — investigations / complaints / disputes flow
  4. `reflection-loop@1.0` — single agent with self-critique loop (cheaper, simpler UCs)

Step 5b — Show the agent archetypes the pattern bundles + ask which extra ones the use case needs.

`AskUserQuestion`:
- `question`: "The chosen pattern wires N agent roles by default: <list>. Do you need any ADDITIONAL agents beyond what the pattern bundles? (Additional ≠ replacement. The pattern's roles are fixed; you can swap their archetype but you can't remove them. Adding a 5th or 6th agent costs LLM spend and audit-trail surface; check `libraries/agents/` first.)"
- `header`: "More agents?"
- `options`: `[{label: "Pattern bundle is sufficient (Recommended)"}, {label: "Yes — add from libraries/agents/"}, {label: "Yes — net-new (REQUIRES JUSTIFICATION)"}]`

If "from library", surface the 14 archetypes with one-line descriptions; multi-select.
If "net-new", capture `name + role + why no library archetype fits` per agent.

Capture as:
```yaml
multi_agent_pattern: <pattern@version>
agent_archetypes_reused: [list]
net_new_agents:
  - name: <kebab>
    role: <role-name>
    justification: <why>
```

**Reuse-rate computation**:
`reuse_rate_agents = (pattern_bundled + library_extras) / (pattern_bundled + library_extras + net_new)`. If `<0.70`, halt and ask the user to revisit.

---

## Round 6 — Rules + thresholds

Walk `rules/` for shared rules and `usecases/*/rules/` for already-promoted UC-specific ones. Each has a description in its `v1.json: description` field (or its `tests/` golden files).

Step 6a — `AskUserQuestion`:
- `question`: "Which existing JDM rules apply to this use case? (Rules from `rules/` are shared across the bank — using one means you inherit its versioned thresholds, regulatory citations, and golden tests. Per Rule 11, business rules NEVER live in agent prompts or service Python.)"
- `header`: "Shared rules"
- `multiSelect`: true
- `options` (up to 4 most relevant inferred from domain):
  - Credit / lending: `single_borrower_exposure`, `dscr_threshold_by_industry`, `leverage_threshold_by_industry`, `reg_o_individual_limit`
  - Concentration: `cre_concentration_limit`, `geographic_concentration_limit`, `sector_concentration_limit`, `insider_aggregate_limit`
  - Real-time: typically none — net-new

Step 6b — Net-new rules:
`AskUserQuestion`:
- `question`: "Are there NEW thresholds / policies / regulations specific to this use case that need their own JDM rule? (Each rule must cite a regulation or board-approved policy in its description per discipline rule #5. If you can't cite one, the threshold belongs in `thresholds` table, not a rule.)"
- `options`: `[{label: "No"}, {label: "Yes — list each (regulation citation required)"}]`

If yes, free-form per rule: name, regulation citation, inputs/outputs sketch.

Capture as:
```yaml
shared_rules_reused: [list]
net_new_rules:
  - name: <kebab>
    citation: <regulation or board-policy ref>
    inputs_sketch: <free-form>
```

**Reuse-rate computation**:
`reuse_rate_rules = len(shared) / (len(shared) + len(net_new))`. Soft target ≥80%; warn if below, but don't hard-halt (some UCs are inherently rule-novel like a new product line).

---

## Round 7 — Model + provider prerequisites + compliance scope

Read `docs/methodology/model-prerequisites.md` so you can present the prereq matrix accurately.

Step 7a — Model + provider:
`AskUserQuestion`:
- `question`: "Which model provider for the agents? (Each has hard prerequisites — picking the wrong one mid-build forced the credit-memo team to rewrite their orchestrator. See `docs/methodology/model-prerequisites.md`.)"
- `header`: "Provider"
- `options` (3):
  1. `Vertex Gemini (gemini-3-1-flash) — default for low-cost real-time`
  2. `Anthropic API (claude-opus-4-7) — long-form reasoning, document IQ`
  3. `Hybrid: Anthropic primary + Vertex fallback (gated by USE_GEMINI flag)`

Step 7b — Surface the prereq checklist for the chosen provider. The user must explicitly tick each prereq:

For Vertex: ADC available / region pinned / `roles/aiplatform.user` granted / `response_schema` enabled (Rule 2).
For Anthropic: API key in Secret Manager / key starts with `sk-ant-api` / `--set-secrets` mount / VPC egress allowed.

`AskUserQuestion` (multiSelect, no "Other"):
- `question`: "Confirm each prerequisite is met (or has a tracked Jira ticket)."
- Each prereq is an option labelled "✓ <prereq>" with a description of what failure looks like.

Step 7c — Compliance scope (SR 11-7):
`AskUserQuestion`:
- `question`: "What's the compliance disclosure scope?"
- `header`: "SR 11-7"
- `options` (3):
  1. `Full pack (Recommended for any UC with HITL or regulator-visible artifacts)` — model card + risk assessment + audit trail spec + monitoring plan
  2. `Lightweight (advisory output only, no regulator visibility)` — model card + audit trail spec
  3. `Defer to platform team` — captured but not authored in this UC; team will add later

Step 7d — Eval framework:
`AskUserQuestion`:
- `question`: "Wire eval framework now? (Per discipline rule #37, eval framework comes BEFORE prompt optimization. Wiring now costs 2 days; wiring later costs reputation when prompt regressions ship undetected.)"
- `options`: `[{label: "Yes — wire structural + LLM-judge scorers (Recommended)"}, {label: "Defer (must be wired before /promote)"}]`

Capture as:
```yaml
model_provider: vertex_gemini | anthropic_api | hybrid
provider_prereqs_confirmed: [list]
provider_prereqs_pending: [list with jira refs]
compliance_scope: full | lightweight | deferred
eval_framework_wired: true | false
```

---

## Step 8 — Compose the canvas

Write `onboarding/<use_case>.yaml` against `.claude/schemas/onboarding.schema.yaml`. Every field captured in rounds 1-7 lands here. Validate by reading `.claude/schemas/onboarding.schema.yaml` and ticking each required key is present.

## Step 9 — Run the reuse-rate gate

```bash
node scripts/check_reuse_rate.mjs onboarding/<use_case>.yaml
```

This is the BLOCKING gate:
- Atomic reuse `<80%` → exit 1, surface the offending net-new services with their justifications
- Agent reuse `<70%` → exit 1, surface the offending net-new agents
- Rules reuse `<60%` → warn but don't fail (some UCs are rule-novel)
- HITL gates `>4` → warn (cookbook says 4 gates is the practical maximum)

If the gate fails, do NOT proceed to Step 10. Instead, present a refusal panel:

> The journey halted because reuse rate is below the bank's target.
> Options:
> 1. Revisit Round 4 / Round 5 and consolidate net-new shapes.
> 2. Run `/fsi-promote-to-library` first to grow the library so the same shapes can be reused next time.
> 3. Get architecture-review approval and re-run with `--override-reuse-gate` (captured in `onboarding.yaml: reuse_gate_override: <approver+date+ticket>`).

Stop. Wait for user.

## Step 10 — Hand off

Print the next-steps panel:

```
═══════════════════════════════════════════════════
  Onboarding journey complete — <use_case>
═══════════════════════════════════════════════════

Canvas:           onboarding/<use_case>.yaml
Console pattern:  <pattern>
Use-case archetype: <archetype@version>
Multi-agent pattern: <pattern@version>
Atomic reuse:     <%>  (<reused>/<reused+new>)
Agent reuse:      <%>  (<reused>/<reused+new>)
Rules reuse:      <%>  (<reused>/<reused+new>)
HITL gates:       <count>
Provider:         <provider>
Compliance scope: <scope>

Next:
  1. /init-use-case <use_case>      — scaffold the directory tree (reads onboarding.yaml)
  2. /fsi-reasons-canvas             — author reasons.yaml seeded from onboarding.yaml
  3. /fsi-build-parallel             — fan-out builders for the 5-step DAG
  4. /review-uc <use_case>           — full review before commit
  5. /fsi-deploy <use_case> --env=dev — deploy to GCP

Cookbook patterns to read for this UC:
  - <pattern_id>: <one-liner>  (e.g., "Pattern 1: HITL via callbacks" if hitl_gates ≥ 2)
  - <pattern_id>: <one-liner>
  ...
```

The user runs `/init-use-case` next; that skill MUST read `onboarding/<use_case>.yaml` (already wired in `init-use-case/SKILL.md` if updated; if not, surface a TODO for the platform team).

## Failure modes you must handle

- **User abandons mid-journey.** Save partial answers to `onboarding/<use_case>.partial.yaml` so they can resume later. On resume, skip rounds already answered.
- **Inventory walk fails (library dir missing).** Halt; tell the user a library dir is malformed and to run `/fsi-reuse-report` to see what's broken.
- **`AskUserQuestion` returns "Other" with no useful content.** Re-ask with a tighter prompt; do not silently default.
- **User picks options that conflict** (e.g. `console_pattern: real-time` + `use_case_archetype: pipeline-originator`). Surface the conflict and re-ask.

## Idempotency

If `onboarding/<use_case>.yaml` already exists, ask: "Existing canvas found. Replace, edit, or abandon?" Never silently overwrite.

## What this skill does NOT do

- Does NOT write code (no Python, no Terraform, no React). Those come from `/init-use-case` + `/new-use-case` + `/fsi-build-parallel`.
- Does NOT modify `libraries/` or `services/atomic/`. Promotions go through `/fsi-promote-to-library`.
- Does NOT call any LLM. Pure interview + file write.
