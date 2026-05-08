---
name: ui-standards
description: Enforce the bank's UI standards on every console for every use case. Auto-invoked when files in `ui/apps/` or `ui/packages/` are being read, written, or edited; also invokable via `/ui-standards onboard <console>`, `/ui-standards check [path]`, or `/ui-standards primitive <need>`. The contract is `docs/methodology/ui-standards.md`. This skill prevents the eight UI bugs we paid for during the credit-memo-commercial build.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, node:*, grep:*, jq:*)
---

# UI standards skill

You are about to read, write, or edit UI code under `ui/apps/` or
`ui/packages/`. Before you do, this skill loads the bank's UI standards
contract and the canonical primitives, layout, and behavior gates.

**The doc is authoritative:** `docs/methodology/ui-standards.md`. This
skill is a worked, invocable interface to that doc — read it once for
context, then come back here for the workflow.

---

## When this skill auto-invokes

- Any Read / Write / Edit of a file under `ui/apps/` or `ui/packages/`
- The user runs `/new-use-case` and reaches Step 2C (UI scaffold)
- The user explicitly invokes `/ui-standards <subcommand>`

If you're invoking a builder subagent (`console-config-builder`,
`e2e-test-builder`) from inside `/new-use-case`, this skill's contract
is what they enforce — they read this doc to know which primitives,
tokens, and gates apply.

---

## Subcommands

| Command | What it does |
|---|---|
| `/ui-standards onboard <console>` | Scaffold a new console end-to-end against the standards. |
| `/ui-standards check [path]` | Run all gate scripts against the path (default: every `ui/apps/`). Reports pass/fail per rule. |
| `/ui-standards check-uc-boundary` | Run `lint_uc_in_console.mjs` to confirm no use-case-specific files leaked into `ui/apps/<console>/`. |
| `/ui-standards primitive <need>` | Answer "which primitive for X?" from the catalog. |
| `/ui-standards token <category>` | Show the canonical token list for color / type / spacing / motion / shadows / layout. |
| `/ui-standards walk <route>` | Walk a route as a user (click every button, follow every link, run a11y scan, snapshot four states). |
| `/ui-standards review` | Run the full gate battery; produce a structured pass/warn/fail report. |

If the user just edits a UI file without invoking a subcommand, run
**`check`** in the background and surface any violations inline as you
help them.

---

## Step 1 — Read the standards (mandatory before any UI work)

Before writing any UI code, **read** `docs/methodology/ui-standards.md`
in full. The doc has 8 sections; the ones you'll consult most:

- §1 (tokens) — palette, type ramp, spacing, motion, shadows, widths
- §2 (primitives) — which `<Component>` to use for which need
- §3 (layout) — AppShell skeleton, route groups, density modes
- §4 (behavior gates) — the 15 rules that block PRs
- §5 (a11y) — keyboard map, focus, ARIA, contrast
- §8 (CI gates table) — which lint script enforces what

If the user's task can be answered by pointing at a section, point at
the section verbatim with the section number — don't paraphrase. The
doc is the contract; paraphrases drift.

---

## Step 2 — Identify the task category

Map the user's request to one of:

| User wants to… | Path |
|---|---|
| Build a new console for a new use case | Step 3 (onboard) |
| Add a screen to an existing console | Step 4 (new screen) |
| Modify an existing screen | Step 5 (modify) |
| Add a primitive to the shared library | Step 6 (new primitive) |
| Audit what's currently built | Step 7 (review) |

If unclear, ask one targeted question. Don't guess.

---

## Step 3 — Onboard a new console

(Triggered by `/ui-standards onboard <name>` or by `/new-use-case`
reaching the UI step.)

Walk the team through these decisions, recording answers in
`usecases/<uc>/ui/console.yaml`:

1. **Console pattern** (one of six — see `docs/methodology/console_reference.md`):
   real-time / investigations / pipeline / surveillance / run /
   recommendations.
2. **Personas** — list every user role. The route group `app/(<role>)/`
   gets scaffolded for each.
3. **Live data channel** — SSE (recommended for in-flight work),
   periodic poll, or static snapshot? (See ui-standards §4.9.)
4. **Banker vocabulary** — list 5–10 platform terms that must NEVER
   leak to UI strings (e.g. "atomic service", "agent", "5-step
   paradigm"). Goes into `usecases/<uc>/ui/banned_terms.yaml`. (§4.13.)
5. **Long-form artifact view** — does this UC render a
   memo/report/certificate? If yes, scaffold the document layout
   (sticky TOC + 760px reading column + citations rail). (§3.4.)
6. **Regulatory clock** — is there a deadline countdown? If yes,
   `<RegulatoryClock>` wired in. (§2.)
7. **Approval gate** — does the user take a decision (approve/decline/
   return)? If yes, `<ApprovalGate>` + audit trail wiring. (§2.)
8. **Print/export** — needs print-clean view + PDF/DOCX export?
9. **Keyboard shortcuts** — confirm the standard map (J/K/Enter/A/D/R/⌘K)
   plus any UC-specific keys. (§5.)
10. **Density modes** — confirm comfortable / compact / spacious will
    ship from PR #1. (§3.5.)

Then run the canonical scaffold from §6 of the doc:

```bash
mkdir -p ui/apps/<console>/{app,lib,styles,components}
cp ui/apps/pipeline-console/{tailwind.config.ts,postcss.config.mjs,next.config.mjs,tsconfig.json} ui/apps/<console>/

echo '@import "@fsi-bank/theme/tokens.css";' > ui/apps/<console>/styles/globals.css
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' >> ui/apps/<console>/styles/globals.css

# Persona route groups (one per declared persona)
for p in <persona-1> <persona-2>; do
  mkdir -p "ui/apps/<console>/app/($p)"
done
```

PR #1 of any new console MUST include all of:

- `app/layout.tsx` rendering `<AppShell>`
- One stat row (`<MetricStrip>` / `<StatCard>`) AND one cases-style
  table (`<CaseRow>`s)
- A click-through demo path: nav item → page → row → detail
- All four states: loading / empty / error / populated
- `scripts/test_ui_smoke.mjs` passing for the new app
- `scripts/lint_ui_*.mjs` all green

---

## Step 4 — Add a screen to an existing console

For every new page:

1. **Pick the console pattern's home structure** — the existing
   console's pattern dictates the layout. Don't invent.
2. **List which primitives you'll use** — every interactive surface
   maps to a primitive in §2. If a primitive doesn't exist, propose
   it (Step 6) before inlining.
3. **Sketch the four states** — even before the populated state. This
   forces you to think about empty / error from the start, not as
   retrofit. (§4.8.)
4. **Identify the data channel** — SSE for in-flight, poll for
   reference, static for never-changes. (§4.9.)
5. **Identify the Server / Client boundary** — start the page Server,
   push interactivity into the smallest Client child. (§4.2.)
6. **Walk the keyboard map** — does any UC-specific key conflict with
   the standard map? (§5.)
7. **Add to nav** — every route MUST be reachable from at least one
   nav item or link. (§4.3.)

Then write the page. Then run `/ui-standards check <path>`.

---

## Step 5 — Modify an existing screen

When editing a UI file, the auto-invocation puts you here.

**Read the file first** (you should always do this anyway for Edit).
Then before changing it:

1. Note which section of the standards governs the change (tokens,
   primitives, layout, behavior, a11y).
2. If you're tempted to add a hardcoded color / size / inline style /
   bare `<button>` / `setInterval(fetch)` / `Intl.NumberFormat` — STOP.
   That's a §1 / §2 / §4 violation. Find the canonical pattern.
3. If you're adding interactivity to a Server Component file, the fix
   is to move the interactivity into a Client child, not stamp `"use
   client"` on the file. (§4.2.)
4. If you're touching a section of the page that renders agent-derived
   data, check the surrounding code uses `<SectionErrorBoundary>` and
   null-safe defaults. If not, fix the surrounding code in the same PR.
   (§4.10.)

After the edit, run `/ui-standards check <path>` and surface any new
violations.

---

## Step 6 — Add a primitive to the shared library

Only when:

- The same pattern appears in 3+ places (rule of three), AND
- The pattern can be parameterized cleanly, AND
- No existing primitive can be extended to cover it

Then:

1. Add the primitive to `ui/packages/components/src/<Name>.tsx`.
2. JSDoc the **width budget** (minimum useful width) and the
   **Server/Client boundary** (display-only or interactive).
3. Export from `ui/packages/components/src/index.ts`.
4. Update `docs/methodology/ui-standards.md` §2 (the primitives table)
   in the same PR.
5. Replace the 3+ inline copies with the new primitive.
6. Run all gate scripts.

Don't add a primitive for one-off use; that's noise.

---

## Step 7 — Review / audit existing UI

`/ui-standards review` runs the full gate battery and produces:

```
UI standards review — ui/apps/<console>

§1 (tokens)              {PASS / FAIL}    lint_ui_tokens.mjs
§2 (primitives)          {PASS / FAIL}    lint_ui_primitives.mjs
§3 (layout)              {PASS / FAIL}    lint_ui_layout.mjs
§4.1 (affordances)       {PASS / FAIL}    test_ui_smoke.mjs --check=affordances
§4.2 (boundaries)        {PASS / FAIL}    lint_ui_boundaries.mjs
§4.3 (route reachability){PASS / FAIL}    test_ui_smoke.mjs --check=link-walk
§4.4 (width budgets)     {PASS / FAIL}    visual regression
§4.8 (four states)       {PASS / FAIL}    test_ui_smoke.mjs --check=four-states
§4.9 (live > polled)     {PASS / FAIL}    grep + lint
§4.10 (defensive)        {PASS / FAIL}    lint_ui_defensive.mjs
§4.11 (SSE invalidation) {PASS / FAIL}    lint_ui_sse_invalidate.mjs
§4.12 (formatters)       {PASS / FAIL}    grep
§4.13 (no jargon)        {PASS / FAIL}    test_ui_smoke.mjs --check=banned-terms
§4.14 (personas)         {PASS / FAIL}    lint_ui_personas.mjs
§5 (accessibility)       {PASS / FAIL}    test_ui_smoke.mjs --check=a11y

OVERALL VERDICT          {READY / NEEDS WORK / BLOCKED}
```

Failed gates BLOCK promotion. Aspirational gates (clearly marked in the
doc) are tracked but don't block.

---

## Quick-answer playbooks

### "Which primitive for X?"

Read §2 of the standards doc. The table maps need → primitive →
width budget → forbidden alternative. If the user's need isn't on the
table, the answer is: propose a new primitive (Step 6), don't inline.

### "How do I render a number / currency / percentage?"

Use the `lib/format.ts` helpers (`fmtUsd`, `fmtPct`, `fmtNumber`),
shared between server and client. Never `new Intl.NumberFormat(...)`
directly in a component. (§4.12.)

### "How do I make a row clickable?"

Wrap the whole `<tr>` in `<CaseRow href="…">`. Never put `<Link>` on
just one cell — the user reads the row as one target. (§4.1.)

### "How do I make a search box?"

`<input type="search" placeholder="…" className="…" />`. Never a styled
`<div>`. (§4.1.)

### "Page is hung at loading; how do I fix?"

That's likely a missing skeleton state. Check the page renders the
loading skeleton from §4.8 before any data arrives, not blank. Then
check the data channel — if it's SSE, the Server Component needs a
Client subscriber that calls `router.refresh()` on state change.
(§4.11.)

### "How do I add a persona?"

Add to `reasons.yaml#discipline_gates.personas`, scaffold the route
group `app/(<persona>)/`, add to the persona switcher, ensure the
landing page lists the new persona. (§4.14.)

### "How do I emit a banner / status notification?"

`<StatusBadge>` for inline status; the AppShell top bar has the
"LiveStatus" slot for system-wide status. For a degraded-mode banner
(any agent stubbed), use `<DegradedBanner>` — it reads from the SSE
stream's `synthesized: true` flag. (Rule 3 of product-build-discipline.)

---

## Anti-patterns to refuse

These are violations of the standards. If you find yourself about to
write one, STOP and find the canonical answer in the doc.

### Tokens (§1)

- `text-[15px]` / `p-[18px]` / `bg-[#fff]` — use the type ramp / spacing
  scale / token palette
- `style={{ color: '#…', padding: 16 }}` — Tailwind classes only
- New custom CSS file outside `ui/packages/theme/src/tokens.css`

### Primitives (§2)

- Bare `<button>` without `onClick` / `type="submit"`
- Bare `<a>` for internal nav (use `next/link` `<Link>`)
- Hand-rolled `<header>` / `<nav>` (use `<AppShell>`)
- Styled `<div>` posing as a search input
- Copy-pasting a primitive's source into an app folder
- Two ways to do the same thing

### Layout (§3)

- Page root that isn't `<AppShell>`
- Drawers narrower than the primitive's width budget (use the *Mini variant)
- Hardcoded widths that don't match the standard table
- Personas added later (must be in PR #1)

### Behavior (§4)

- `setInterval(fetch, …)` on case-state queries (use SSE)
- Server Component passing inline `() =>` to a child (move boundary)
- `Intl.NumberFormat` in a component file (use `lib/format.ts`)
- `.map()` / `.replace()` / `.startsWith()` without null-safe defaults
- Server page that never re-renders on SSE state change
- Platform jargon in user-visible strings ("atomic service", "ADK
  agent", "5-step paradigm")
- Screens missing any of: loading / empty / error / populated states

### Accessibility (§5)

- `outline: none` without a replacement focus indicator
- Color-as-only-signal (red without an icon + label)
- Icon-only buttons without `aria-label`
- Forms with placeholder-as-label
- Tab order that skips around the page

---

## How this skill talks to other skills

- **`/new-use-case` Step 2C** — invokes this skill's onboard subcommand.
- **`/review-uc` Step 2A** — runs this skill's `review` subcommand as
  part of the static checks.
- **`console-pipeline` / `console-realtime` / etc.** — the per-pattern
  console skills load THIS doc as their styling/behavior contract.
  They don't restate the rules; they reference them.
- **`fsi-prompt-update`** — when a behavior change affects the UI
  (new field surfaced, new banner, new persona), this skill flags
  which gates re-run.

---

## Reference

The full standards doc: `docs/methodology/ui-standards.md`.

The product-build discipline doc (broader, includes non-UI rules):
`docs/methodology/product-build-discipline.md`.

The token sources (don't edit without updating both):

- TypeScript: `ui/packages/theme/src/index.ts`
- CSS: `ui/packages/theme/src/tokens.css`
