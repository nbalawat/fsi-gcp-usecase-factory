---
name: fsi-design-proposals
description: After /fsi-onboard locks the canvas, generates 4 parallel UX prototypes (sealed designer agents in worktrees, each with a distinct variation axis — density / metaphor / affordance / wildcard), builds each as a real Next.js app on the existing pipeline-console shell, and deploys each to its own ephemeral Cloud Run URL. Halts before /init-use-case so the user can click through 4 working options and pick one via /fsi-design-review. Does NOT pick the winner; that's /fsi-design-review's job.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, find:*, grep:*, node:*, python3:*, sha256sum:*, shasum:*, gcloud:*, git:*), Agent, AskUserQuestion
---

You are running Stages 1-3 of the UX-first design lockdown for a use case. By the end, the user has 4 ephemeral URLs to click through. They pick one via the sister skill `/fsi-design-review`. This skill does not pick.

## Inputs

- `$ARGUMENTS` — kebab-case use case id (must match an existing `onboarding/<use_case>.yaml`).
- Optional flags:
  - `--dry-run` — go through Stages 1-2 but skip Cloud Build deploys (useful for testing the agents)
  - `--respin` — second pass; reads existing `usecases/<uc>/ui/decision.yaml` for annotations and seeds 3 NEW agents (E, F, plus one user-chosen variation) constrained by the user's keep/drop/change notes. Forbidden if `iteration_count >= 1`; tell the user to escalate to arch-review.
  - `--options=A,B,C` — specific subset of options to (re)build (default A,B,C,D)

## Hard preconditions

1. `onboarding/<use_case>.yaml` exists. Compute its SHA-256 — this is `canvas_sha256`. Every option's manifest must echo this back; mismatch ⇒ rejected output.
2. `usecases/<use_case>/` does not yet exist OR contains only `ui/proposals/` (not `ui/components/`). If `ui/components/` exists, refuse: "This UC's design is already locked. Use `/fsi-design-review --redo` to override." Stop.
3. `services/atomic/`, `libraries/agents/`, `libraries/use-cases/` populated (they are; this is a check).
4. `gcloud auth list` shows an active account, project = `agentic-experiments` (or whatever `dev.env: GCP_PROJECT` is). If not, tell the user to `source dev.env` and retry.

## Stage 1 — Pre-flight (~1 min)

```bash
mkdir -p usecases/<uc>/ui/proposals/_shared
mkdir -p usecases/<uc>/ui/proposals/option-{a,b,c,d}
mkdir -p .fsi-state/<uc>/proposals
node scripts/generate_mock_canvas_data.mjs <use_case>
# emits usecases/<uc>/ui/proposals/_shared/mock-data.ts
```

Verify the generated mock-data.ts contains a `CANVAS_SHA256` constant matching the SHA you computed. If not, halt — the generator is broken.

Stamp a pre-flight summary into `.fsi-state/<uc>/proposals/preflight.json`:

```json
{
  "use_case_id": "<uc>",
  "canvas_sha256": "<sha>",
  "generated_at": "<iso>",
  "options_planned": ["a", "b", "c", "d"],
  "skill_version": "1.0.0"
}
```

## Stage 2 — Spawn 4 sealed designer agents (~15-25 min)

This is the heart of the skill. **You MUST emit all 4 Agent calls in a single assistant message** so they run concurrently. Each Agent is sealed in its own git worktree branch — no cross-contamination, maximum design diversity.

For each option, spawn an Agent with these properties:

- `subagent_type`: `general-purpose`
- `isolation`: `worktree`
- `description`: `"Design option <X>: <axis>"`
- `model`: `opus` (this is creative work — Sonnet 4.6 produces noticeably blander UX)
- `prompt`: see "Designer agent prompt template" below, with the variation seed substituted

### Designer agent prompt template

Substitute `{OPTION}`, `{VARIATION_AXIS}`, `{VARIATION_SEED}`, `{USE_CASE}`, `{CANVAS_SHA256}`, `{CANVAS_SUMMARY}`. Send each agent a copy with their own substitutions.

```
You are designing UX option {OPTION} for use case "{USE_CASE}". You will
work in a sealed git worktree — do NOT read or reference any other option's
files. Other agents are designing the same use case in parallel; design
diversity is the goal. If you converge on what you think the others would
do, you have failed.

== CONSTRAINTS (HARD) ==

1. Variation axis for THIS option: {VARIATION_AXIS}
   Seed instruction: {VARIATION_SEED}

2. Canvas SHA-256 you must echo back in your manifest: {CANVAS_SHA256}
   (Mismatch = your output gets rejected. Just echo it.)

3. Scope — implement EXACTLY two routes:
   - case-detail   (the moment-of-truth screen)
   - approval-flow (the HITL action surface)
   Skip portfolio, persona-switcher, settings, ingest. We're optimising
   for design signal, not surface coverage.

4. Reuse:
   - Import shared primitives from ui/packages/components/ wherever possible
   - Import the existing pipeline-console shell at ui/apps/pipeline-console/
     (you mount on top of it; you do NOT replace it)
   - Use the shadcn/ui + Atrium token system; do NOT introduce a new CSS framework
   - Components imported as `@uc/components/...` are read-only — you write
     new components only into usecases/{USE_CASE}/ui/proposals/option-{OPTION}/

5. Mock data: import everything from
   usecases/{USE_CASE}/ui/proposals/_shared/mock-data.ts (READ-ONLY).
   Do NOT modify it; do NOT create your own fixtures. All 4 options must
   render the same data so the comparison is real.

6. Output budget per agent: $1.50 LLM spend, 30-min wall clock.

== WHAT TO PRODUCE ==

Write into usecases/{USE_CASE}/ui/proposals/option-{OPTION}/:

  app/case/[id]/page.tsx           — the case-detail screen
  app/approval/[id]/page.tsx       — the approval-flow screen
  app/layout.tsx                   — minimal shell wiring
  components/                      — option-specific components (named
                                     so they don't collide with shared)
  lib/data.ts                      — re-exports + adapters from
                                     ../_shared/mock-data.ts
  manifest.yaml                    — see option-manifest.schema.yaml
  rationale.md                     — 1-2 paragraphs: WHY this design fits
                                     the canvas; what user pain it removes
  tradeoffs.md                     — what you optimised for / sacrificed,
                                     in 4-6 bullet points
  Dockerfile                       — single-stage Next.js image; copy from
                                     ui/apps/pipeline-console/Dockerfile
                                     and adapt

== CANVAS SUMMARY ==

{CANVAS_SUMMARY}

== HARD RULES (architecture-auditor will reject violations) ==

- No business logic in components — UI only. The mock-data module already
  contains every value you need; do not compute thresholds, ratios, or
  decisions in the page.
- No new CSS files at the app level — extend Atrium tokens or use
  Tailwind utilities only.
- Every interactive control has a real onClick / href / onSubmit. No
  decorative buttons. No <div> styled as a button.
- No "Section unavailable" placeholders — every section renders or is
  conditionally hidden based on the data shape.
- Every {USE_CASE.HITL_GATES[i]} from the canvas has a corresponding
  approval action in the approval-flow screen.
- tsc --noEmit must pass on your output. ESLint with the repo's config
  must pass. If you can't get it green within budget, finalize what you
  have and document the failure in rationale.md.

== SUCCESS CRITERIA ==

When you finish, your option-{OPTION}/manifest.yaml MUST:
- Have canvas_checksum == "{CANVAS_SHA256}"
- List ≥3 components from ui/packages/components/ in components_used (reuse evidence)
- Have density_score, motion_budget, affordance_pattern, primary_metaphor filled
- Include hero_screenshot path (you don't take the screenshot — the build
  pipeline does — but pre-declare the file path)
- Include design_summary (60-400 chars)
- Include tradeoffs.optimised_for and tradeoffs.sacrifices

You may NOT modify ../{a,b,c,d}/* outside your own option-{OPTION} directory.
You may NOT modify ../_shared/* (read-only contract).
You may NOT modify any file under services/, libraries/, infra/, or
ui/packages/. Read-only.

Begin.
```

### Per-option variation seeds

| Option | Variation axis | Seed instruction |
|---|---|---|
| A | density | "Design for an executive who scans the screen in 30 seconds. Sparse. Every pixel earns its place. The artifact (decision card / memo / aggregate cell) IS the page; chrome compresses to a header strip + a tiny right-rail." |
| B | metaphor | "The workflow is the metaphor. Stages drive layout: the current stage is the hero (60% of viewport), prior stages compress to a left rail with status pills, future stages are dimmed but visible. Pipeline activity is the SPINE of the page, not a drawer." |
| C | affordance | "Decisions live next to the data that informs them. Inline approve/reject per section; no sticky bottom bar; no modal. The user's eye never has to leave the section to act on it. Each section ends with the action it enables." |
| D | wildcard | "Read the canvas, the cookbook, and the discipline rules. Pick a defensible 4th position the other three did NOT take. Examples: a conversation timeline (every agent + human action as a chat-style row), a regulator-audit-first surface (compliance pack is the page, decision is a footer), a forensic deep-dive (every value is one click from its citation). Pick ONE; commit hard."  |

### After agents complete

For each option directory:

1. **Sanity check the manifest.** Parse `manifest.yaml`; verify `canvas_checksum` equals the canvas SHA. Mismatch → mark option as failed; do NOT deploy. Note in `.fsi-state/<uc>/proposals/<option>.failed`.
2. **TypeScript gate.** Run `cd usecases/<uc>/ui/proposals/option-<x>/ && npx tsc --noEmit -p tsconfig.json` (the option's Dockerfile runs this in CI; we run it here for fast-fail). On failure, capture stderr to `<option>.tsc-error.log` and mark failed.
3. **Component-reuse floor (HARD GATE, Phase 0.3).** Parse `manifest.yaml: components_used`. Count entries where `source: shared` OR `source: use-case`. The floor is **5 per option**:
   - **< 5**: option is FAILED. Stamp `manifest.yaml: build.reuse_floor_met: false` + `build.reuse_count_shared: <n>`. Do NOT deploy. Add ⚠ in `.fsi-state/<uc>/proposals/<option>.failed` with reason `"reuse-floor: <n> shared components, need ≥5"`. The comparator will render the option as failed-to-build.
   - **≥ 5**: stamp `build.reuse_floor_met: true`. Proceed.

   Run the validator to do this in one shot:

   ```bash
   node scripts/check_reuse_floor.mjs <use_case>
   ```

   The validator exits 1 if any option fails the floor; the skill captures this but continues with the options that passed (don't block the whole pipeline on one stuck agent).

4. **Diversity scorer.** For pairs of options (6 pairs across A/B/C/D), compute Jaccard similarity over `components_used[].name`. If pairwise Jaccard > 0.6, log a warning — agents are converging. Surface in hand-off panel.

5. **Net-new ceiling.** If `net-new` count > 5 on any option, attach a ⚠ in the option's manifest. Don't fail; user might still pick it; the judge surfaces the count.

If all 4 options fail, halt: tell the user "0/4 designer agents produced compilable output. Run with `--respin` to retry, or use `--skip-deploy` for ASCII-only review." Print agent error logs.

## Stage 2.5 — Judge pass (~3-5 min, single Agent call)

Before any Cloud Build burns money, run the judge LLM call. It reads all 4 option directories + the bank's design contracts and emits an objective scorecard. The human still picks the winner; the judge surfaces signal (violations, reuse counts, convergence, recommended ranking).

Spawn ONE Agent in a separate message (so it doesn't compete for slots with the 4 designers):

- `subagent_type`: `general-purpose`
- `model`: `opus`
- `isolation`: `worktree` is NOT used — the judge is read-only across all 4 options + the design-contract docs, so it must work in the main worktree
- `description`: `"Judge pass: score 4 design options against bank standards"`
- `prompt`: copy `.claude/skills/fsi-design-proposals/assets/judge-prompt.md` verbatim, substituting `{USE_CASE}`, `{RUN_ID}` (timestamp-based), and `{CANVAS_SHA256}`

The judge MUST write its output to `archives/design-tests/<run-id>/judge-report.json`. The `<run-id>` is the same timestamp the pre-flight stamped into `.fsi-state/<uc>/proposals/preflight.json`.

### After the judge completes

1. **Read** `archives/design-tests/<run-id>/judge-report.json`.
2. **Validate** — file is present + valid JSON + `canvas_sha256` matches the pre-flight SHA.
3. **Stamp each option's manifest.yaml** with `judge.composite_score`, `judge.violations`, `judge.reuse_floor_met`, `judge.hitl_gates_wired` from the report. The comparator reads these.
4. **Surface signal in the per-option summary printed at hand-off**:
   - "Recommended by judge: option-X (composite 4.2/5)"
   - "Convergence detected: A ↔ C (Jaccard 0.72)" if `convergence_pairs` non-empty
   - "Violations across options: <count>" with breakdown

### Refusal handling

If the judge fails (cost cap hit, file write fails, JSON malformed): proceed to Stage 3 anyway, but flag in the hand-off panel that the judge pass was incomplete. The user can still pick from the deployed options; they just lack the objective scoring layer.

### Why no auto-promotion based on judge score?

The judge is calibration, not authority. A high-scoring option that doesn't resonate with the human is still the wrong pick for that UC. The judge surfaces the floor (no violations, hits reuse threshold, wires HITL); the human picks the ceiling (which design actually fits the work).

## Stage 3 — Build + deploy (~10 min, parallel Cloud Builds)

For each option that passed Stage 2 gates, submit one Cloud Build:

```bash
gcloud builds submit . \
  --config infra/templates/design-proposal-cloudbuild.yaml \
  --substitutions=_USE_CASE=<uc>,_OPTION=<x> \
  --async
```

Capture the build IDs into `.fsi-state/<uc>/proposals/builds.json`. Use `gcloud builds list --filter="..." --format="json"` to poll status (every 30s; max 30 min).

For each successful build:
- Read the URL from the `url.txt` build artifact (`gsutil cp gs://...`)
- Write to `.fsi-state/<uc>/proposals/<option>.url`
- Update `usecases/<uc>/ui/proposals/option-<x>/manifest.yaml: build.ephemeral_url`
- Update `manifest.yaml: build.deploy_succeeded: true`

For each failed build:
- Capture the build log
- Update `manifest.yaml: build.deploy_succeeded: false` + `build.error_log_path`
- Surface in the final summary as ⚠

### Skip-deploy mode (`--dry-run`)

If invoked with `--dry-run`, skip Stage 3 entirely. Surface a summary that lists each option's local path + manifest.yaml + rationale.md and instruct the user that `/fsi-design-review --static` can run the comparator off local files.

## Stage 3.5 — a11y scan per option (~1 min)

After Cloud Build + deploy completes (Stage 3), run the accessibility check against each option's deployed URL:

```bash
node scripts/check_a11y_per_option.mjs <use_case>
```

This invokes pa11y against each `.fsi-state/<uc>/proposals/<x>.url` and stamps each option's `manifest.yaml: build.a11y_violations` + `build.a11y_scan_mode` + `build.a11y_violation_codes`.

If pa11y is not installed (or `--dry-run` was used), fall back to:

```bash
node scripts/check_a11y_per_option.mjs <use_case> --static
```

The static heuristic does NOT replace a real pa11y run — it's a directional offline check. It catches obvious failures (`<div onClick>`, `<img>` without `alt`, icon-only buttons without `aria-label`, anchors without `href`).

Violation budget: **5 per option**. Options exceeding the budget get a ⚠ badge in the comparator but are NOT auto-failed — the user can still pick them; the judge surfaces the count as a violation. Options below budget pass clean.

### Refusal handling

If pa11y fails for every option (binary missing, network down): fall back to `--static` and note in the hand-off panel that the live a11y scan didn't run. The user can run the live scan later via `/fsi-design-review --a11y-rescan`.

## Stage 3.6 — Playwright real-browser validation (~50 sec, BLOCKING)

After Stage 3.5 stamps a11y heuristics, run the **real-browser validation** against each deployed option. This is the gate the architecture-auditor checks on every commit; skipping it (without an explicit `playwright-skipped.yaml` rationale + arch-review approval) means the resulting `decision.yaml` is auditor-blocked.

What it captures, per option, per route (`/case/sample` + `/approval/sample`), per viewport (1440×900 / 1024×768 / 768×900):

- full-page PNG screenshot
- console errors + warnings
- failed network requests (4xx/5xx + transport)
- axe-core scan (`wcag2a + wcag2aa + wcag21a + wcag21aa + best-practice`)
- CLS via `PerformanceObserver({type:'layout-shift'})`
- LCP via `PerformanceObserver({type:'largest-contentful-paint'})`

Run it:

```bash
node scripts/validate_with_playwright.mjs <use_case> <run-id>
```

The `<run-id>` is the same timestamp the pre-flight stamped into `.fsi-state/<uc>/proposals/preflight.json` — the script reads it from there if not given explicitly.

The script:

1. Reads `.fsi-state/<uc>/proposals/<option>.url` per option (set by Stage 3) → if any are missing, the option is skipped with `skip_reason` and the comparator marks it as ⚠.
2. Launches headless Chromium via the project-scoped `.claude/mcp/node_modules/playwright/`.
3. Hits each option's two routes at 3 viewports = 6 page loads per option.
4. Writes per-option report to:
   - `usecases/<uc>/ui/proposals/option-<x>/playwright-report.json` (live copy, comparator reads from here)
   - `archives/design-tests/<run-id>/option-<x>/playwright-report.json` (forever archive)
   - `archives/design-tests/<run-id>/option-<x>/screenshots/*.png` (6 PNGs)

Budgets (each emits a warning in the comparator, NOT a hard fail of the option — the human still picks):

| Budget | Value |
|---|---|
| `total_a11y_violations` | ≤ 5 per option |
| `total_console_errors` | 0 |
| `cls_worst` | ≤ 0.1 (Google "good") |
| `lcp_worst_ms` | ≤ 2500 (Google "good") |

### Skip path (rare; auditor-tracked)

If `--dry-run` was set, OR Cloud Build failed for all 4 options, OR Playwright cannot be spawned (CI without Chromium), write an explicit skip rationale to:

```yaml
# archives/design-tests/<run-id>/_meta/playwright-skipped.yaml
schema_version: "1.0.0"
skipped_at: <iso>
reason: "<why>"   # one of: dry-run | all-builds-failed | chromium-unavailable | sandbox-restriction
approver: <only required if not dry-run; arch-review-approved>
ticket: <jira ref if approver set>
```

The auditor allows the skip ONLY if this file exists and (for non-dry-run skips) names a valid approver + ticket. Otherwise the resulting `decision.yaml` is auditor-blocked at commit time.

### After Playwright completes

1. Read each option's `playwright-report.json` + stamp the option's `manifest.yaml`:
   ```yaml
   build:
     playwright_validated_at: <iso>
     playwright_a11y_violations: <int>
     playwright_console_errors: <int>
     playwright_cls_worst: <float>
     playwright_lcp_worst_ms: <int>
     playwright_budgets_passed: <int>
     playwright_budgets_failed: <int>
   ```
2. Surface in the hand-off panel:
   ```
   ── Playwright (Stage 3.6) ──
     A:  ⚠ a11y 7  err 0  CLS 0.04  LCP 1.2s   3/4 budgets
     B:  ✓ a11y 2  err 0  CLS 0.02  LCP 0.9s   4/4 budgets
     C:  ⚠ err 3   a11y 4  CLS 0.01  LCP 1.1s   3/4 budgets
     D:  ✓ a11y 1  err 0  CLS 0.00  LCP 1.0s   4/4 budgets
   ```
3. The judge (Stage 2.5) does NOT see the Playwright report — it ran earlier. But the comparator (rendered for Stage 4) DOES read the playwright fields and renders the live-a11y / console / CLS / LCP row per panel.

## Stage 4 — Hand off to /fsi-design-review

Print the next-steps panel:

```
═══════════════════════════════════════════════════════════════
  Design proposals ready — <use_case>
═══════════════════════════════════════════════════════════════

  Canvas SHA          : <sha:0..16>…
  Options planned     : 4
  Built successfully  : <n>/4
  Deployed            : <n>/4

  ─── Option A · density ────────────────────────────────────
    URL          : <url> [or ⚠ build/deploy failure]
    Persona      : <persona.primary>
    Density      : ★★☆☆☆ (1-5)
    Affordance   : <affordance_pattern>
    Metaphor     : <primary_metaphor>
    Reuse        : <shared+use-case>/<total> components
    Cost         : $<llm_usd> + $<cloud_build_usd>

  ─── Option B · metaphor ───────────────────────────────────
    …

  ─── Option C · affordance ─────────────────────────────────
    …

  ─── Option D · wildcard ───────────────────────────────────
    …

  Total cost   : $<sum>
  Total time   : <wallclock> min

  Next:
    /fsi-design-review <use_case>
       Opens the side-by-side comparator (HTML page locally), lets
       you click through each option's case-detail + approval flow,
       and captures your pick + keep/drop/change annotations into
       usecases/<use_case>/ui/decision.yaml.

  If you want to halt and discard:
    /fsi-design-discard <use_case>   (deletes options + Cloud Run services;
                                      preserves nothing in the archive)
```

## Failure modes

- **All 4 agents fail to compile.** Surface logs; suggest `--respin`.
- **3+ agents converge.** Pairwise Jaccard > 0.6 across all pairs. Halt; print: "Designs are too similar. Run with `--respin --diverge` and we'll re-prompt the agents with explicit anti-convergence constraints."
- **Cloud Build fails for 1-2 options.** Continue; note in summary; user can still pick from the remaining.
- **Cloud Build fails for 3+ options.** Halt; surface logs; `--respin --rebuild-only` repeats Stage 3 without re-running agents.
- **Canvas changes mid-build (sha mismatches).** Halt; tell user to either revert canvas changes or `/fsi-onboard --redo` then re-run.
- **User Ctrl-C mid-agent.** Worktrees are preserved; surface a "resume?" prompt; `/fsi-design-proposals <uc> --resume` picks up from the partial state in `.fsi-state/<uc>/proposals/`.

## Idempotency

- Re-running with same canvas SHA + same `--options` set: if all options' manifests have matching SHA AND `build.deploy_succeeded`, skip and surface existing URLs. Tell user to use `--force` to re-run.
- Re-running with `--respin`: requires `iteration_count == 0` in any existing `decision.yaml`; otherwise refuses.

## Cost ceiling

The skill enforces a $20 per-UC ceiling (LLM + Cloud Build + Cloud Run). Tracked via per-Agent usage + per-build duration. If exceeded, halt and surface partial state.

## What this skill does NOT do

- Does NOT modify `services/`, `libraries/`, or `ui/packages/`.
- Does NOT call `/init-use-case` or scaffold any backend code.
- Does NOT write `usecases/<uc>/ui/decision.yaml` (that's `/fsi-design-review`).
- Does NOT delete losing options' Cloud Run services (that's `/fsi-design-review` after promotion).
