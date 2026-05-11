# Playwright validation — driving real browsers against design proposals

Static source analysis catches some violations; **a real browser catches the rest**. Hydration errors, layout shifts, runtime console errors, network failures, and the WCAG violations that only show up after the page mounts — none of these appear in `tsc --noEmit`.

This doc explains where Playwright fits into the UX-first lockdown.

---

## Two entry points

The factory exposes Playwright two ways, and they share the same `axe-core` + `playwright` libraries installed under `.claude/mcp/node_modules/`.

| Entry point | Who runs it | When | What it does |
|---|---|---|---|
| **`mcp__playwright__*` tools** | Claude Code itself | During interactive review (you ask me "what's broken in option B's case detail screen?") | Drives Chromium live — navigate, click, screenshot, console capture, network capture. Stateful within one Claude Code session. |
| **`scripts/validate_with_playwright.mjs`** | CI, pre-commit, `/fsi-design-review` | After every design-proposal run | Standalone Node.js. Captures the SAME signals as the MCP tools but as a deterministic report. Produces `playwright-report.json` per option. |

You don't pick one; both are wired. The MCP gives you a real browser at your fingertips during review; the script bakes that signal into archives.

---

## Setup (one-time, per dev machine)

```bash
cd .claude/mcp
npm install
npx playwright install chromium --with-deps
```

After install, restart Claude Code. The `mcp__playwright__*` tools should appear in the toolset.

`node_modules/` and the Chromium binary are gitignored (~150 MB; each dev installs locally). The `package.json` is committed.

---

## What gets captured per option per route

`scripts/validate_with_playwright.mjs` runs against each option's deployed URL (or local Next.js dev server) at **3 viewports × 2 routes**:

- Viewports: 1440x900 / 1024x768 / 768x900
- Routes: `/case/sample` and `/approval/sample`

Per (option, route, viewport) it records:

| Signal | Source | Budget |
|---|---|---|
| Screenshot (full page PNG) | `page.screenshot({ fullPage: true })` | — |
| Console errors | `page.on("console", ...)` | **0** (any error fails) |
| Console warnings | same | — |
| Failed requests (4xx/5xx + network failures) | `page.on("response")` + `page.on("requestfailed")` | — |
| Accessibility violations | `axe-core` injected via `addScriptTag` + `axe.run()` with `wcag2a + wcag2aa + wcag21a + wcag21aa + best-practice` rulesets | **5** per option total |
| Cumulative Layout Shift (CLS) | `PerformanceObserver({type:'layout-shift'})` after 1.5s settle | **0.1** (Google "good") |
| Largest Contentful Paint (LCP) | `PerformanceObserver({type:'largest-contentful-paint'})` | **2500 ms** |

The report writes per-viewport detail + an aggregate `summary` block. Budget violations don't auto-fail an option — they show as warning pills in the comparator. The judge LLM call sees the same data and folds it into its scoring.

---

## What the comparator renders

When `playwright-report.json` exists alongside an option, the comparator:

- Replaces the iframe (when no live URL) with the **1440px case-detail screenshot** so you can SEE the design at a glance even without a deploy.
- Adds a stat row below the judge row: `live-a11y N` / `console N` / `CLS X.XX` / `LCP NNNms` / budgets passed N/M.
- Highlights over-budget metrics in amber.

The screenshot fallback is the single biggest improvement for offline review — without it, "deploy failed" was the comparator's only state when no Cloud Build had run.

---

## Where reports land

```
archives/design-tests/<run-id>/option-<x>/
├── playwright-report.json    ← the structured report
└── screenshots/
    ├── case-id-sample-1440.png
    ├── case-id-sample-1024.png
    ├── case-id-sample-768.png
    ├── approval-id-sample-1440.png
    ├── approval-id-sample-1024.png
    └── approval-id-sample-768.png
```

The archive is forever — auditor protects these files from deletion. Screenshots are PNG; budget on size is the same as for archives (small per-option footprint, kept).

---

## When during the design-proposal lifecycle does it run?

```
/fsi-design-proposals <uc>
  Stage 1 — preflight
  Stage 2 — 4 designer agents spawn
  Stage 2.5 — judge LLM call
  Stage 3 — Cloud Build + deploy (parallel)
  Stage 3.5 — pa11y/heuristic a11y scan         ← Phase 0.2 (added earlier)
  Stage 3.6 — Playwright validation             ← NEW: this doc's subject
     • Runs scripts/validate_with_playwright.mjs against each deployed URL
     • Captures screenshots + axe + perf + console + network per option
     • Falls back to screenshot-only when a deploy failed but a build succeeded
  Stage 4 — render comparator (now embeds Playwright data)
       ↓
/fsi-design-review <uc>
  Stage 5 — user picks via comparator (now MUCH richer)
  ...
```

If `--dry-run` was set (no Cloud Build), Stage 3.6 either:
- Spins up Next.js dev servers per option locally (slow; `--static-render` opt-in)
- Or skips Playwright validation entirely; the comparator falls back to the design-summary-only view.

---

## Interactive validation via MCP

When I (Claude) need to investigate a specific option's behavior, I can call:

```
mcp__playwright__browser_navigate({ url: "https://fsi-uc-credit-memo-design-d-...run.app/case/sample" })
mcp__playwright__take_screenshot({ filename: "option-d-case-detail.png", fullPage: true })
mcp__playwright__console_messages()
mcp__playwright__browser_snapshot()        # accessibility tree
mcp__playwright__network_requests()
mcp__playwright__evaluate({ script: "document.querySelectorAll('[role=button]').length" })
```

Stateful: cookies, localStorage, auth persist across calls within the same Claude Code session. Useful for testing HITL flows that need a logged-in state.

---

## Cost / time

- Per option, 3 viewports × 2 routes: ~12-15 seconds wall-clock
- 4 options in sequence: ~50-60 seconds
- Per-screenshot disk: 50-150 KB PNG, 5-12 KB base64 if returned to Claude (we never return — we save to disk and reference)
- Per-screenshot token cost (when displayed to Claude later): ~800-1200 tokens for a 1440x900 screenshot — not free; use targeted reads

The validator could be parallelized across options (4 concurrent browsers) for ~3x speedup; today it runs sequentially for simplicity. Easy win if total time matters.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Playwright not installed` | First-time setup not run | `(cd .claude/mcp && npm install)` |
| `Browser binary missing` | npm install didn't fetch Chromium | `(cd .claude/mcp && npx playwright install chromium --with-deps)` |
| All options "skipped: no URL" | Cloud Build hasn't run yet | Either deploy via Cloud Build, or pass `--url-prefix=http://localhost:3000` after starting a local dev server |
| `nav_error: timeout` | Page didn't load in 30s | Cloud Run cold start; re-run validation OR raise timeout in script |
| `a11y_violations_sample` shows `landmark-one-main` | Missing `<main>` element | Designer agent skipped semantic landmarks; fix in the option's `app/case/[id]/page.tsx` |
| `CLS > 0.1` | Late-loading images / fonts shift layout | Pre-allocate space; add `width`/`height` to `<img>`; use `font-display: swap` |
| `LCP > 2500ms` | Render-blocking JS or large hero image | Move data fetching to Server Components; compress the hero |
| `console_errors` non-zero | Hydration mismatch or undefined-access at runtime | The static a11y heuristic missed this; the designer agent's defensive UI is incomplete |

---

## Why this matters for 100 builders

The whole point of the UX-first lockdown is **objective signal** at the pick moment. Today's designer agents are good; some are great; some have subtle bugs that only manifest at runtime.

Without Playwright:
- The judge LLM scores the source code, not the rendered output
- The comparator shows rationale + tradeoffs but no visual evidence
- Hydration / layout / runtime / a11y bugs land in production

With Playwright:
- Every option's case-detail screen is screenshotted at 3 viewports
- Every runtime error is captured
- Every WCAG violation is named with its WCAG ID
- The judge has access to the same data
- The human picks with all the evidence on screen

This is the difference between "I think B looks good" and "B has zero console errors, 2 a11y violations both fixable, CLS 0.05 (excellent), LCP 1.2s (excellent), and the screenshot looks clean at 768px."

That's the bar for 100 builders.
