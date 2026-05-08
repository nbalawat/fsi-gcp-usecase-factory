# UI standards

**This is the single source of truth for any UI in any use case.** Every
console, every dashboard, every internal page across all 100+ use cases
adheres to what's below. If a use case needs something not in here, the
fix is to add it to this doc (with a CI gate), not to invent it inline.

This doc consolidates and replaces:

- `docs/methodology/ui-authoring.md` (the seven incidents-paid-for from
  the pipeline-console build) — folded into Section 4 below.
- The UI-relevant subset of `docs/methodology/product-build-discipline.md`
  (rules 12–19, paid for on credit-memo-commercial) — also folded into
  Section 4.

The doc is structured so a builder can read it linearly the first time,
then jump back to specific sections as a reference.

| Section | Purpose |
|---|---|
| 1 — Tokens | The palette, type, spacing, motion, shadows. The contract. |
| 2 — Primitives | Which `<Component>` to use for which need. |
| 3 — Layout | AppShell skeleton, route groups, standard widths, density modes. |
| 4 — Behavior gates | The 15 rules that block PRs from merging. |
| 5 — Accessibility | The keyboard / contrast / ARIA floor. |
| 6 — Onboarding a new console | Step-by-step. |
| 7 — Diagnostic questions | What `/new-use-case` Step 2C asks. |
| 8 — CI gates summary | Every rule paired with its enforcement. |

---

## 1. Tokens — the palette IS the contract

All visual primitives flow from `ui/packages/theme/`. Apps consume them
two ways: TypeScript constants (Tailwind picks them up via
`tailwind.config.ts`) and CSS custom properties (`@import` in
`styles/globals.css`). Both sources are the same numbers — never edit
one without the other.

### 1.1 Color (Atrium palette)

Anchor: **Coral Black `#0F0B0B`** + **Deloitte Green `#86BC24`**. Every
other color is a tier of those two, plus four muted semantics.

| Token group | Tokens | Use for |
|---|---|---|
| `paper` | `paper`, `paper-2`, `paper-3`, `paper-pure` | page bg, cards, raised panels, deep shells |
| `ink` | `ink-1`…`ink-4` | text, from primary to disabled |
| `rule` / `border` | `rule`, `border`, `border-strong` | hairline / 1px / emphasized borders |
| `accent` | `accent`, `accent-hover`, `accent-pressed`, `accent-fg`, `accent-tint` | the single brand-green dot — buttons, focus rings, selected nav |
| `brandBlack` | `brandBlack`, `brandBlack-fg` | top-bar branding, dark bands |
| `semantic` | `success`, `warning`, `danger`, `info` (each + `-tint`) | status, banners, badges |
| `dark` | `dark.ground`, `dark.ground-2`, `dark.ground-3`, `dark.sand`, … | terminals, dark mode, brand bands |
| `riskBand` | `1-pass` … `5-loss` | OCC risk-rating heatmap; never use for any other domain |

**Rule.** New code uses Atrium-native names (`bg-paper-2`, `text-ink-1`,
`border-rule`, `bg-accent`, `text-semantic-success`). Legacy aliases
(`bg-brand-primary`, `text-text-primary`, `bg-status-okBg`) remain only
for migration; the auditor flags them on changed lines.

### 1.2 Typography

Three families. Don't add a fourth.

| Family | Use | CSS var | Tailwind class |
|---|---|---|---|
| Inter Tight | UI text, buttons, navigation | `--font-sans` | `font-sans` |
| Source Serif 4 | Display headings, document body (memos, narratives) | `--font-serif` | `font-serif` |
| JetBrains Mono | Tabular numerics, code, identifiers | `--font-mono` | `font-mono` |

Type ramp (`--fs-*` → Tailwind `text-*`):

| Use | Token | Size |
|---|---|---|
| Hero display | `display-1` / `-2` / `-3` | 72 / 56 / 40 |
| Section headings | `h1` / `h2` / `h3` / `h4` | 32 / 24 / 19 / 16 |
| Body | `body` / `body-sm` | 16 / 15 |
| UI text | `ui` | 14 |
| Captions / mono | `caption` / `mono` / `mono-sm` | 12.5 / 14.5 / 12.5 |
| Eyebrow / label | `eyebrow` | 11 (uppercase, +0.06em letter-spacing) |

Weights: `regular 420` (Atrium uses optical 420 not 400), `medium 500`,
`semi 600`, `strong 650`.

**Rule.** No `style={{ fontSize: 16 }}`, no inline px values, no
`text-[15px]`. Pick the closest token; if nothing fits, the type ramp
needs a new entry — open a discussion.

### 1.3 Spacing

| Token | Px | Use |
|---|---|---|
| `s-1` | 4 | tight inline (icon ↔ label) |
| `s-2` | 8 | between related labels |
| `s-3` | 12 | input internal padding |
| `s-4` | 16 | default block gap |
| `s-5` | 20 | between paragraphs |
| `s-6` | 24 | between cards |
| `s-7` | 32 | section break |
| `s-8`–`s-11` | 40 / 56 / 72 / 96 | major layout gaps |

**Rule.** Tailwind `p-*` / `m-*` / `gap-*` only. No inline
`style={{ padding: 16 }}`, no arbitrary `p-[18px]`. The grid is the
contract.

### 1.4 Motion

| Use | Duration | Easing |
|---|---|---|
| Hover, color tint | `--t-fast` (120ms) | `--ease` (cubic-bezier(0.2,0,0,1)) |
| Stage transitions, expand/collapse | `--t-mod` (180ms) | same |
| Row enter / exit (queue) | 300ms | same, with stagger 30ms |
| Page transitions | n/a — Next.js owns it |

**Rule.** Motion communicates state change; it doesn't decorate. If a
designer requests a 600ms bounce, the answer is no — it slows down
power users. Respect `prefers-reduced-motion` (Section 5).

### 1.5 Shadows + radii

| Token | Use |
|---|---|
| `--shadow-sheet` | popovers, command palette, modal sheets |
| `--shadow-pop` | floating menus, tooltips |
| `--shadow-input-focus` | focus ring (3px green @ 32% opacity) |
| `--r-1` (4px) | small inputs, tags |
| `--r-2` (8px) | cards, buttons |
| `--r-3` (12px) | large panels, modals |
| `--r-pill` | status badges |

### 1.6 Layout dimensions

| Token | Px | Use |
|---|---|---|
| `--w-read` | 720 | reading-line for prose |
| `--w-doc` | 760 | memo / document column |
| `--w-grid` | 1440 | max content width |
| `--h-header` | 56 | top bar |
| `--h-toolbar` | 40 | secondary bar |
| `--h-row` | 36 | table row |
| `--nav-w` | 240 | sidebar (expanded) |
| `--nav-w-collapsed` | 56 | sidebar (icons-only) |

**CI gate.** `scripts/lint_ui_tokens.mjs` rejects any of:
`text-[NNpx]`, `p-[NNpx]`, `bg-[#…]`, inline `style={{ color: '#…'  }}`,
imports of fonts not from `@fsi-bank/theme`.

---

## 2. Primitives — what to use when

Every shared primitive lives in `ui/packages/components/src/`. Apps
import them via `@fsi-bank/components`.

| Need | Primitive | Width budget | Don't |
|---|---|---|---|
| Top chrome (header + nav) | `<AppShell>` | full page | hand-roll `<header>` + `<nav>` |
| Breadcrumb in toolbar | `<BreadcrumbNav>` | full toolbar | inline `<a>` chain |
| One queued case row | `<CaseCard>` | column / drawer | DIY card |
| Whole-row link in a table | `<CaseRow>` (use-case scope) | full row | wrap `<tr>` in `<Link>` (invalid HTML) |
| KPI strip | `<MetricStrip>` | full width | row of one-off `<div>`s |
| Single KPI tile | `<StatCard>` | 220 each (4-col grid) | DIY card with `bg-…` |
| Status pill with dot | `<StatusBadge>` | inline | `<span className="bg-…">` |
| Inline pipeline progress | `<StepProgress>` | inline | hand-roll dots |
| 5-step paradigm (wide) | `<ProcessFlow>` | 720 min | recreate steps inline |
| 5-step paradigm (narrow) | `<PipelineMini>` | 280 min, ≤420 wide | `<ProcessFlow>` (will overflow) |
| Multi-agent chain (wide) | `<AgentChain>` | 600 min | recreate cards inline |
| Multi-agent chain (narrow) | `<AgentMini>` | 280 min, ≤420 wide | `<AgentChain>` (will overflow) |
| Per-agent reasoning panel | `<AgentReasoningPanel>` | 320–600 | inline `<details>` |
| Workflow stage rail | `<WorkflowStageRail>` | full width | DIY stage indicator |
| Regulatory clock / countdown | `<RegulatoryClock>` | inline | DIY `setInterval` countdown |
| Approval decision dialog | `<ApprovalGate>` | modal | inline `<button>`s with `confirm()` |
| Section error fallback | `<SectionErrorBoundary>` (per-app) | wraps section | bare component throws crash whole page |

**Rule.** If a primitive exists, use it. If it doesn't — propose it once
in `ui/packages/components/`, then use it everywhere. Two ways to do
the same thing is the bug.

**Width budget.** Every primitive's source file declares its minimum
useful width in JSDoc. If your container is narrower, switch to the
*Mini variant or widen the column. Putting a 720px `ProcessFlow` in a
420px drawer overflows in production; we paid for that lesson once.

**Server vs Client.** Components with interactive props (`onClick`,
`onChange`, `useState`, hover state) MUST start with `"use client";`.
Components that are display-only (badges, cards, layouts) MUST NOT carry
the directive — let the page decide where the boundary lives. If a
Server page tries to pass an inline function to a Server child,
Next.js throws. That's a layering bug; fix by moving the boundary, not
by stamping `"use client"` on more files.

**CI gate.** `scripts/lint_ui_primitives.mjs` rejects:

- Bare `<button>` in app pages without `onClick` or `type="submit"`
- Bare `<a href>` not wrapped in `next/link` `<Link>` for internal nav
- Bare `<input>` (use the form primitive in `@fsi-bank/components`)
- Hand-rolled `<header>` / `<nav>` outside the AppShell
- Direct copy-paste of a primitive's source into an app folder

---

## 3. Layout — every app has the same skeleton

### 3.1 AppShell

```
┌─────────────────────────────────────────────────────────────┐
│ [Brand · use-case-name]   [persona switcher]  [search · 🔔 · 👤] │  ← top bar (56px)
├──────┬──────────────────────────────────────────────────────┤
│      │ [breadcrumbs · primary actions]                      │  ← toolbar (40px)
│ Nav  ├──────────────────────────────────────────────────────┤
│ 240  │                                                      │
│      │     main content (max-width 1440px)                  │
│      │                                                      │
│      │                                                      │
└──────┴──────────────────────────────────────────────────────┘
```

`AppShell`'s nav items each carry `href`. Don't put `<button>`s in nav.
The active item highlights via the route, not a click handler.

Top-bar slots, in order:

1. Brand + use-case name (left)
2. Persona switcher (middle-left) — only if the use case has >1 persona
3. Live status badge (middle-right) — colored dot + "N/M services up"
4. Search (`<input type="search">`) — required if the use case has >50 cases
5. Notifications bell — with click handler (no dead chrome)
6. Avatar / profile menu — with click handler

### 3.2 Route groups for personas

```
ui/apps/<console>/app/
├── layout.tsx                    ← top-level shell + theme + cookies
├── page.tsx                      ← landing / persona-switcher
├── (underwriter)/
│   ├── layout.tsx                ← persona-specific shell decoration
│   ├── queue/page.tsx
│   └── cases/[id]/page.tsx
├── (cco)/
│   ├── portfolio/page.tsx
│   └── watchlist/page.tsx
└── (rm)/
    ├── origination/page.tsx
    └── prescreen/page.tsx
```

Personas are scaffolded in PR #1 even if only one is built first.
Retrofitting later costs 3× (we measured).

### 3.3 Standard widths

| Surface | Width |
|---|---|
| Reading column (memo, narrative) | 760px |
| Sidebar (expanded) | 240px |
| Sidebar (collapsed) | 56px |
| Drawer / detail rail | 420px |
| Modal sheet | 480 / 640 / 800 (small / medium / large) |
| Dashboard grid | 4 columns × 220px stat cards (full width 1440 max) |

### 3.4 Common layouts

- **Queue + detail split** — table left, detail rail right (drawer or
  full route). Rail is 420px; if more space is needed, navigate to a
  full case page.
- **Dashboard + drilldown** — `MetricStrip` row, then a 2- or 3-column
  grid of cards, each card opens to a route.
- **Stage rail + body** — `WorkflowStageRail` at top, then a
  document-style body (the credit memo pattern).
- **Document view** — sticky TOC left (`<MemoTOC>`), 760px reading
  column center, optional citations rail right.

### 3.5 Density modes

Every console supports three density modes via a top-bar control,
persisted in a cookie:

- **Comfortable** (default) — full padding, 36px row height
- **Compact** — 28px row height, smaller paddings
- **Spacious** — for presentation / projector mode

Implemented via a `data-density` attribute on the AppShell root; CSS
selectors handle the rest.

**CI gate.** `scripts/lint_ui_layout.mjs` rejects pages whose root is
not `<AppShell>` (or that import an AppShell component into the page
itself instead of the layout). Also flags hardcoded widths that don't
match the standard list.

---

## 4. Behavior gates — the don't-repeat list

Each gate below was paid for in a real incident. The rule, the why, and
the gate are all required.

### 4.1 Every interactive surface has a handler or href

A page that *looks* like an ops console but acts like a screenshot is
worse than one that admits it's a screenshot. Every visible affordance
is a promise.

| Element | Must have |
|---|---|
| `<button>` | `onClick`, `type="submit"`, or removed |
| `<a>` / `<Link>` | `href` (never `href="#"` / `href=""`) |
| Table rows representing entities | Whole row clickable — wrap in `<CaseRow href=…>` |
| Stat cards that imply a drilldown | `<Link>` wrap, or remove the affordance |
| Search box | `<input type="search">`, never a styled `<div>` |
| Nav items | `href`, never `<button>` without `onClick` |
| Bell / avatar / kebab menus | `onClick` opens a real menu, or removed |

**CI gate.** `scripts/test_ui_smoke.mjs` clicks every visible button and
asserts the page state changed (navigation, dialog open, fetch fired).
Buttons that do nothing fail the build.

### 4.2 Server / Client boundaries are explicit and minimal

Start every page as a Server Component. Push interactivity into the
**smallest possible** Client Component child. Inline arrow functions
from a Server page to a Server child throw at render — that's a
layering bug, not styling.

| Pattern | Boundary |
|---|---|
| Page reads data + renders | Server (`page.tsx`) |
| Row navigates on click | Client (`case-row.tsx`) |
| Approval gate w/ confirm dialog | Client (`approval-actions.tsx`) |
| Anything with `onClick` / `useState` / `useEffect` | Client |
| Stat cards (display only) | Server |
| Static badges, breadcrumbs | Server |

**CI gate.** Lint rule that a Server-default file passing inline `() =>`
to a child component is flagged. Pre-commit blocks until the boundary
moves.

### 4.3 Every route is reachable from at least one nav item or link

If you build a route, link to it. If you can't link to it, delete it.
Stub routes (use case still being built) MUST exist as a "Coming soon"
page, not a 404.

**CI gate.** `scripts/test_ui_smoke.mjs` walks every nav `href` and
every `<Link>` `href` discovered in the rendered HTML and asserts each
loads with status 200.

### 4.4 Components have a width budget; layouts honor it

Documented in Section 2. If a component overflows its container, switch
to the *Mini variant or widen the column.

**CI gate.** Visual-regression snapshots at 1440 / 1024 / 768 viewport
widths catch overflow.

### 4.5 One framework theme — Tailwind only

The Atrium tokens in `ui/packages/theme/` are the single source of
truth. No CSS modules, no styled-components, no CSS-in-JS. Tailwind
classes that resolve to tokens, plus the reset/utility CSS in
`tokens.css`. New custom CSS lives ONLY in `tokens.css`.

**CI gate.** `scripts/lint_ui_tokens.mjs` (Section 1.6).

### 4.6 One pattern per primitive

Documented in Section 2. If two ways to do the same thing exist in the
codebase, one of them is wrong — pick the canonical primitive and
rip out the other.

**CI gate.** Architecture-auditor flags duplicate implementations.

### 4.7 Walk the page like a user before you ship it

Before claiming a UI task done, **personally** open the page in a
browser and: click every button, click every link, click every row, tab
through, type in every input, resize 1440 → 1024 → 768, inspect
rendered HTML for empty placeholders. CI runs `test_ui_smoke.mjs`
headlessly; that doesn't replace your hands.

**No screenshots-as-proof.** A screenshot proves a screenshot.

**CI gate.** PR template requires a "walked the page" checkbox; pre-merge.

### 4.8 Loading / empty / error / populated states for every screen

Every shipped screen has all four states. No exceptions.

| State | What it shows |
|---|---|
| Loading | Skeleton matching final layout (no spinners on the page; spinners only inline next to the thing being loaded) |
| Empty | Purposeful illustration + one-sentence explanation + one CTA. Never "No data". |
| Error | What failed + what to do next + Retry button (where applicable) |
| Populated | The real thing |

Why: multiple "the page is hung at Application Received and the spinner
is turning" exchanges. The page wasn't hung — it was in an unrendered
loading state with no skeleton. The user couldn't distinguish "still
processing" from "broken".

**CI gate.** `scripts/test_ui_smoke.mjs` toggles a `?state=…` URL param
that injects each of the four states into the React tree (dev/test
only); visual-regression snapshots stored per state.

### 4.9 Live > polled > static

Any screen that displays in-flight work uses a push channel (SSE,
WebSocket). Polling (`setInterval(fetch, …)`) only for screens that
display reference data with a >5s update tolerance. Static files only
for never-changing reference data.

Why: pipeline-console queue page initially polled every 5s; three
tabs = 3× load + 5s of stale UI. Switching to SSE collapsed three
subscribers into one push channel; UI updates landed within 200ms of
DB write.

**CI gate.** `grep -rnE "setInterval.*fetch.*(/api/cases|/api/audit)"`
rejects any matches. Lint blocks new pages from doing it.

### 4.10 Defensive UI — schema drift is real

Every section component is wrapped in `<SectionErrorBoundary>` that
catches render-time exceptions and renders an inline notice with a
Retry button. Every `.map()` on agent-derived data uses `?? []`. Every
`.replace()` / `.startsWith()` / `.toFixed()` is null-safe.

Why: multiple `TypeError: Cannot read properties of undefined` crashes
during the credit-memo build. Every new agent output had subtle drift;
the UI assumed schema-perfection and crashed on close-but-not-exact.

**CI gate.** `scripts/lint_ui_defensive.mjs` flags `.map(`, `.replace(`,
`.startsWith(`, `.toFixed(` whose receiver is not (a) inside a
try/catch (b) preceded by `?? []` / `?? ""` / `Number(...)` coercion.

### 4.11 SSE state changes trigger router invalidation

Every Server Component page that displays state subject to async
updates includes a Client child that subscribes to SSE and calls
`router.refresh()` on a debounced state-change event.

Why: "the page is stuck at intake stage" — case completed in DB, SSE
pushed the change, Server Component never re-fetched because nothing
told it to.

**CI gate.** Lint rule: every `app/**/page.tsx` that imports from
`lib/live-data.ts` must also include either a Client subscriber or a
comment justifying it as a one-shot snapshot.

### 4.12 Hand-rolled formatters or pinned ICU

Numbers and currency rendered by SSR use either (a) a hand-rolled
formatter shared between server and client, OR (b) `Intl.*` APIs
configured identically on both sides with a pinned ICU version. Default
`Intl.NumberFormat` differs across server (Node-bundled ICU) and client
(browser ICU) for compact notation; this WILL produce hydration errors.

Why: "Server: $25.0M / Client: $25M" hydration mismatch. The fix was a
6-line `fmtUsd` helper; finding the cause took 40 minutes.

**CI gate.** Lint rule against direct `new Intl.NumberFormat(...)` in
`ui/packages/components/` and `ui/apps/*/components/`. Allowed only in a
designated `lib/format.ts` imported by both server and client.

### 4.13 No technical-jargon leakage

User-facing text uses the user's vocabulary, not the platform's. "5-step
paradigm", "atomic services", "ADK agent" do not appear on a credit
officer's screen.

Why: the first credit-memo console said "Step 4: Drafting"; a credit
officer asked "what's drafting? Are you drafting a contract?".

**CI gate.** `scripts/test_ui_smoke.mjs` extends a per-use-case banned
words list (defined in `usecases/<uc>/ui/banned_terms.yaml`) and rejects
any matches in `app/**/page.tsx` strings.

### 4.14 Personas first-class from PR #1

Every FSI workflow has 3–5 distinct user roles (RM, analyst,
underwriter, CCO, compliance). The persona switcher and `app/(persona)/`
route group are scaffolded from PR #1, not retrofitted.

**CI gate.** `init-use-case` template includes the persona-route-group
scaffold for every persona declared in `reasons.yaml#discipline_gates.personas`.

### 4.15 Every claim cites a source

Narrative output from any agent that lands in a regulator-visible
artifact (memo, recommendation, risk rating) carries per-claim
citations. UI surfaces them on hover/click.

**CI gate.** Schema validation enforces citation density ≥0.80 for every
artifact tagged `regulator_visible: true` in `reasons.yaml`.

### 4.16 Live event spine is visible by default

Every page that displays in-flight work has a visible event-spine
panel — `<PipelineActivity>` or equivalent — showing the live stream
of `application_events` as services and agents fire. Hidden-by-default
event panels (collapsed in a settings drawer) violate this rule;
the user must SEE the system processing work to trust it.

Per-event row shows: timestamp, banker label, service or agent name,
latency, optional cost. Agent rows render as agent-activity tiles
(Rule 4.17).

Why: a console where the work is happening but invisible feels
broken. Multiple "the page is hung" exchanges trace to this. The
fix is structural, not cosmetic.

**CI gate.** Lint rule: every case-detail page (`app/cases/[id]/...`)
that imports `live-data.ts` must also include `<PipelineActivity>`
or carry a comment justifying the omission. See the `event-spine-ui`
skill for the canonical implementation.

### 4.17 Agent activity tiles surface state, not spinners

Every UI region that shows agent output renders the four-state tile
(pending / running / completed / failed-or-stubbed) per the
`agent-activity-ui` skill. Generic spinners labeled "Loading…" are a
violation — when the agent is running, show its tokens-in count, its
elapsed time, and which model it's using.

**CI gate.** Lint rule: any `<Spinner>` or `<Loader>` component used
inside an agent-output region must be replaced with the
`<AgentActivityTile>` four-state pattern.

### 4.18 Audit trail is the SOP — same panel, same exports across UCs

Every regulator-visible artifact has an `/audit/<id>` route. The audit
panel uses the SHARED layout (totals strip + view toggle + filter bar
+ chronological list + drill-in). Exports validate against
`infra/shared/schemas/audit-trail.schema.json`. Custom one-off audit
panels per use case are forbidden — every UC's audit panel must look
the same so an examiner who learns it once uses it on every UC.

**CI gate.** `scripts/lint_audit_panel_shape.mjs` (placeholder; flags
any `audit-trail.tsx` whose top-level structure deviates from the
shared `<AuditPanel>` layout). The shared primitive lives at
`@fsi-bank/components` once promoted (Rule of Three).

---

## 5. Accessibility — the floor

WCAG AA is the minimum, not the target. The credit officer's day-job is
keyboard-driven; making them reach for a mouse for any common task is a
defect.

| Requirement | What it means |
|---|---|
| Keyboard activation | Every clickable element responds to Enter / Space |
| Focus visibility | `:focus-visible` produces a 3px green ring (`--shadow-input-focus`); never `outline: none` without a replacement |
| Tab order | Follows reading order — top to bottom, left to right |
| Skip link | First focusable element on every page is "Skip to main content" |
| Color contrast | AA: 4.5:1 for body text, 3:1 for large text and UI |
| Color is not the only signal | Icons + labels accompany color (red = X icon + "Declined", not just red) |
| Motion respect | `@media (prefers-reduced-motion: reduce)` disables transitions over 200ms |
| ARIA roles | Tables → `role="table"`, navigation → `role="navigation"`, banners → `role="status"` / `"alert"` |
| Form labels | Every input has `<label>` (visible or `aria-label`); never placeholder-as-label |
| Icon-only buttons | `aria-label` describes the action |
| Live regions | SSE-driven counters use `aria-live="polite"` so screen readers announce changes |

**Standard keyboard map** (every console implements):

| Key | Action |
|---|---|
| `J` / `K` | Next / previous row in queue |
| `Enter` | Open the focused row |
| `A` / `D` / `R` | Approve / decline / return on case detail |
| `Esc` | Close modal / drawer |
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘/` | Show keyboard shortcuts |

**CI gate.** `scripts/test_ui_smoke.mjs` runs `axe-core` against every
declared route + the four states; any violation at `serious` or
`critical` severity blocks the PR.

---

## 6. Onboarding a new console

For any new use case (or a second console in an existing one):

```bash
# 1. Scaffold the app from the template
mkdir -p ui/apps/<console-name>/{app,lib,styles,components}
cp ui/apps/pipeline-console/{tailwind.config.ts,postcss.config.mjs,next.config.mjs,tsconfig.json} ui/apps/<console-name>/
# Customize package.json — change "name", keep deps

# 2. Wire the Atrium theme
echo '@import "@fsi-bank/theme/tokens.css";' > ui/apps/<console-name>/styles/globals.css
echo '@tailwind base; @tailwind components; @tailwind utilities;' >> ui/apps/<console-name>/styles/globals.css

# 3. Reuse AppShell + the framework primitives
# import { AppShell, MetricStrip, CaseCard, ... } from "@fsi-bank/components"
# DO NOT duplicate them under ui/apps/<console-name>/components

# 4. Scaffold the persona route groups (one per persona declared in reasons.yaml)
mkdir -p ui/apps/<console-name>/app/{(underwriter),(cco),(rm)}/

# 5. PR #1 must include:
#    - page.tsx that renders inside <AppShell> with this console's `active` set
#    - At least one stat row + one cases-style table
#    - Click-through demo path: nav item → page → row → detail
#    - All four states (loading / empty / error / populated) implemented
#    - test_ui_smoke.mjs passes
```

---

## 7. Diagnostic questions at scaffold

`/new-use-case` Step 2C asks every team building a new UI:

1. **Console pattern** — which of the six (real-time, investigations,
   pipeline, surveillance, run, recommendations)? See
   `docs/methodology/console_reference.md`.
2. **Persona count** — how many user roles? List them; route groups get
   scaffolded.
3. **Density modes** — confirm comfortable / compact / spacious will
   ship from PR #1.
4. **Live data channel** — SSE topic / table / poll? (Live > polled >
   static.)
5. **Banker vocabulary** — list 5–10 platform terms that must NOT leak
   to UI strings. Goes into `usecases/<uc>/ui/banned_terms.yaml`.
6. **Memo / artifact view** — does this use case render a long-form
   document (memo, report, certificate)? If yes, sticky TOC + 760px
   reading column scaffold.
7. **Regulatory clock** — is there a deadline countdown? If yes,
   `<RegulatoryClock>` wired to the case state.
8. **Approval gate** — is there a decision the user takes (approve /
   decline / return)? If yes, `<ApprovalGate>` + audit trail wiring.
9. **Print / export** — does the artifact need a print-clean view + PDF
   / DOCX export?
10. **Keyboard shortcuts** — confirm the standard map (J/K/Enter/A/D/R/⌘K)
    plus any UC-specific keys.

Answers persist into `usecases/<uc>/ui/console.yaml` (the existing
configured-UI contract).

---

## 8. CI gates — every rule paired with a check

| Section | Rule | Gate script |
|---|---|---|
| 1.6 | No raw color / size / inline style | `scripts/lint_ui_tokens.mjs` |
| 2 | Use shared primitives, not bare elements | `scripts/lint_ui_primitives.mjs` |
| 3 | AppShell-rooted pages | `scripts/lint_ui_layout.mjs` |
| 4.1 | Every interactive has handler / href | `scripts/test_ui_smoke.mjs --check=affordances` |
| 4.2 | Server/Client boundaries | `scripts/lint_ui_boundaries.mjs` |
| 4.3 | Every route reachable | `scripts/test_ui_smoke.mjs --check=link-walk` |
| 4.4 | Width budgets honored | visual regression at 1440/1024/768 |
| 4.5 | Tailwind-only styling | `scripts/lint_ui_tokens.mjs` |
| 4.6 | One pattern per primitive | architecture-auditor |
| 4.8 | Four states per screen | `scripts/test_ui_smoke.mjs --check=four-states` |
| 4.9 | No setInterval on case-state | grep + lint |
| 4.10 | Defensive null-safety | `scripts/lint_ui_defensive.mjs` |
| 4.11 | SSE → router invalidation | `scripts/lint_ui_sse_invalidate.mjs` |
| 4.12 | No `Intl.NumberFormat` in components | grep |
| 4.13 | No platform jargon in UI strings | `scripts/test_ui_smoke.mjs --check=banned-terms` |
| 4.14 | Personas scaffolded in PR #1 | `scripts/lint_ui_personas.mjs` |
| 4.15 | Citation density ≥80% on regulator artifacts | schema validator |
| 4.16 | Live event spine visible on case-detail pages | `scripts/lint_event_spine_present.mjs` |
| 4.17 | Agent tiles surface state (no plain spinners) | `scripts/lint_agent_tiles.mjs` |
| 4.18 | Audit panel uses shared layout + shared exports | `scripts/lint_audit_panel_shape.mjs` |
| 5 | A11y floor (axe-core) | `scripts/test_ui_smoke.mjs --check=a11y` |

A rule without a gate is a recommendation. Recommendations are ignored
under deadline pressure. Every new rule added to this doc gets a gate
before the entry can land in `master`.

---

## How to use this doc

**At scaffold time** — `/new-use-case` Step 2C reads Section 7 and asks
the team. Decisions are recorded in `usecases/<uc>/ui/console.yaml` and
`reasons.yaml#discipline_gates`.

**At review time** — `/review-uc` runs every gate in Section 8 as part
of static checks. Failed gates block promotion.

**For new builders** — read this doc once in full. Then keep it open
while building. Every section is a checklist.

**For platform team** — every quarter, walk new incidents from the
prior 90 days and add rules to the relevant section. Each new rule
gets a gate before the entry merges. Words decay; gates don't.
