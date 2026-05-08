---
name: agentic-ui-principles
description: The umbrella contract for every agentic use case's UI. Auto-invoked alongside `ui-standards` whenever any file under `ui/apps/` or `usecases/<uc>/ui/` is read, written, or edited; also when a new console is scaffolded. Codifies the FIVE principles every console must satisfy — event-spine-first, process as the primary metaphor, agent activity is visible live, audit trail as SOP, human in the loop. The mechanics live in three sub-skills (`event-spine-ui`, `agent-activity-ui`, `process-narrative-ui`); this skill is the framing + the routing.
---

# Agentic UI principles

You are about to read, write, or edit UI for a use case in this
factory. Before you do, **load the contract**: every console for every
use case satisfies five principles. They are the difference between
"a dashboard" and "an agentic application that a credit officer trusts
and an OCC examiner can audit".

## The five principles (one-line each)

1. **Event-spine-first** — the live event stream IS the primary fact;
   the UI surfaces it. Push channel, no polling.
2. **Process as the primary metaphor** — the UI mirrors the user's
   business process, never the platform's 5-step paradigm.
3. **Agent activity is visible — live** — every agent action is
   observable as it happens; reasoning, inputs, tools, citations.
4. **Audit trail as SOP** — same panel, same exports, same filters
   across every use case; an examiner learns it once.
5. **Human in the loop, not in the audience** — the user approves /
   declines / edits / overrides; the agent proposes, the human commits.

The full doc is `docs/methodology/agentic-ui-principles.md`. **Read
that first** if this is your first use case build.

---

## When this skill auto-invokes

Whenever any of these files are touched:

- `ui/apps/<console>/**/*.{ts,tsx}`
- `usecases/<uc>/ui/**/*.{ts,tsx}`
- `usecases/<uc>/ui/console.yaml`

The `ui-standards` skill ALSO auto-invokes (tokens / primitives /
layout / behavior gates / a11y). The two skills compose. This skill
owns the **what** (the principles); `ui-standards` owns the **how**
(the components).

---

## Step 1 — Identify the work

Walk the user's task into one of:

| Task | Sub-skill |
|---|---|
| Render in-flight events / live queue / pipeline-activity panel | `event-spine-ui` |
| Render an agent's reasoning / inputs / outputs / live "agent thinking" | `agent-activity-ui` |
| Build the audit-trail panel / export JSON or CSV / regulator view | `agent-activity-ui` |
| Top-level console layout / persona switcher / process rail | `process-narrative-ui` |
| Approval gate / decision capture / override-with-reason | `ui-standards` §HITL |
| Token / primitive / layout / behavior-gate question | `ui-standards` |

If unclear, default to **walk the principles in order** (Steps 2–6
below) and note which apply.

---

## Step 2 — Principle 1: event-spine-first

For every page that displays in-flight work, ask:

- Is the data fetched via SSE / WebSocket from `/api/live/stream`
  (or equivalent)? If polling, that's a violation.
- Does the page subscribe to state changes and call `router.refresh()`
  on update (Next.js)? If not, the page will go stale.
- Is the event stream rendered somewhere visible — even if collapsed —
  so the user can see "the system is doing something"? Hidden = invisible
  = "is this thing on?"

If any of those is missing, load the `event-spine-ui` skill and apply
its patterns. Canonical reference:
`usecases/credit-memo-commercial/ui/components/pipeline-activity.tsx`.

---

## Step 3 — Principle 2: process as the primary metaphor

For the top-level console structure, ask:

- Is the navigation ordered by the **business process** (intake →
  spread → policy → drafting → approval → posting), not by platform
  layers (handlers / atomic / rules / agents / sinks)?
- Does every page that shows a single case have a stage rail at top
  showing where the work is in the process?
- Is the vocabulary the **user's** vocabulary (banker / analyst /
  compliance), with platform terms ("atomic service", "ADK agent")
  banned via the per-UC `banned_terms.yaml`?
- Are personas first-class (route group `app/(<persona>)/`)?

If any is missing, load the `process-narrative-ui` skill. Canonical
reference: `ui/apps/pipeline-console/app/(underwriter|cco|rm)/`.

---

## Step 4 — Principle 3: agent activity is visible — live

For any region of the UI that shows agent output, ask:

- Is there a "currently running" indicator while the agent is in
  flight? Or does the user just see a spinner with no information?
- After the agent finishes, is there a **one-line banker summary** that
  expands to show inputs / reasoning / tools / output / citations?
- Is the **banker view ↔ engineer view** toggle present in the audit
  panel?
- Are model + latency + cost + confidence shown alongside the output?
  (Trust requires visibility into cost and latency.)

If any is missing, load `agent-activity-ui`. Canonical reference:
`usecases/credit-memo-commercial/ui/components/agent-audit/`.

---

## Step 5 — Principle 4: audit trail as SOP

For every regulator-visible artifact (memo, recommendation, risk
rating), ask:

- Is there an `/audit/<application_id>` route?
- Does the audit panel use the SHARED layout (filter bar at top,
  cost+latency totals, banker/engineer toggle, JSON+CSV export)?
- Does the export validate against `schemas/audit-trail.schema.json`?
- Are citations resolvable (clicking pops the source excerpt)?

If missing, load `agent-activity-ui` (audit trail is its second half).

---

## Step 6 — Principle 5: human in the loop

For every decision the system surfaces, ask:

- Is there an `<ApprovalGate>` capturing the human's commitment
  (approve / decline / return_for_revision)?
- Can the underwriter **edit before approving** (memo paragraphs,
  recommendation narrative)?
- Can the underwriter **override-with-reason** (e.g. agent says SM,
  override to Pass; reason captured in audit trail)?
- Is there a **time-sensitive clock** if the use case has a regulatory
  deadline (Reg E, SAR 30-day, etc.)?

If missing, load `ui-standards` and section 4 (HITL) of the standards
doc.

---

## Step 7 — Final pass — "top-notch"

Before declaring the screen done, walk the top-notch checklist (also
in `agentic-ui-principles.md` "What top-notch means"):

- [ ] Live (push channel; new rows fade in)
- [ ] Motion communicates state change (chips, rows, alerts)
- [ ] All four states (loading / empty / error / populated)
- [ ] Banker prose, never JSON
- [ ] Cost + latency surfaced
- [ ] Confidence shown; below-threshold highlighted
- [ ] Citations resolve to source excerpts
- [ ] Print-clean (`⌘P` produces a clean PDF)
- [ ] Keyboard-first (J/K/Enter/A/D/R/⌘K)
- [ ] Empty-first design (works in the first 5 minutes)

This is the bar. Below this is rejected at `/review-uc`.

---

## How this skill talks to other skills

- **`ui-standards`** — governs tokens / primitives / behavior gates;
  this skill governs the principles that compose them.
- **`event-spine-ui`** — owns the live event stream pattern.
- **`agent-activity-ui`** — owns live agent visibility + audit trail SOP.
- **`process-narrative-ui`** — owns the business-process layout +
  persona switcher.
- **`adk-agent-design`** — when authoring an agent, this skill ensures
  the agent emits the fields the audit-trail UI needs (model, latency,
  cost, confidence, reasoning, tools, citations).
- **`/new-use-case`** — Step 2C calls this skill's umbrella to walk
  the team through the five principles before the console scaffold.

---

## Anti-patterns to refuse

- **Polling on case-state queries** — use SSE (Principle 1).
- **Platform jargon in UI strings** — banker vocabulary (Principle 2).
- **Agent output rendered as raw JSON** — banker prose with citations
  (Principle 3).
- **Audit trail as a "nice to have"** — SR 11-7 floor; required from
  PR #1 (Principle 4).
- **Auto-execution of irrevocable actions** — forbidden by CLAUDE.md;
  every irrevocable action through HITL (Principle 5).
- **Custom one-off UI per use case** — every console reuses the
  primitives; if a primitive doesn't exist, propose it once and reuse
  everywhere.

---

## Reference

- `docs/methodology/agentic-ui-principles.md` — full doc with diagrams
- `docs/methodology/ui-standards.md` — design system contract
- `docs/methodology/product-build-discipline.md` — don't-repeat list
- Canonical implementation: credit-memo-commercial — read it before
  starting use case #2.
