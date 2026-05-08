# Agentic UI principles

> **The user is in the loop, not the audience.** Every console for every
> use case must show what the system is doing as it does it, who decided
> what, and why. Static pages with hidden machinery are a non-starter for
> banking — credit officers, complaint analysts, compliance officers,
> CCOs all need to defend every decision to OCC examiners, Board reviews,
> and customers.

This doc codifies the **five principles** that turn a generic dashboard
into a top-notch agentic UI — one that surfaces the live event spine,
the agent activity, the business process, and the human-in-the-loop
controls in a way that makes the platform's intelligence visible and
auditable.

It is the **conceptual contract**. The mechanics live in four sub-skills:

| Skill | Owns |
|---|---|
| `ui-standards` | Tokens, primitives, layout, behavior gates, a11y |
| `agentic-ui-principles` (this doc) | The five principles + umbrella |
| `event-spine-ui` | Live event-stream UX (SSE, stage chips, drill-in) |
| `agent-activity-ui` | Live agent visibility + audit trail SOP |
| `process-narrative-ui` | Business-process-first navigation + persona views |

Every console adheres. Every PR is reviewed against these principles
before promotion.

---

## The five principles

### 1. Event-spine-first

The Pub/Sub event stream is **the primary fact** of the system, and the
UI surfaces it as such. New applications appear as they're published. Stages
flip from amber to green in real time. A credit officer watches the queue
process — they don't poll, they don't refresh.

This is the difference between "looks live" and "is live". A demo that
shows a static row will not impress; a demo where you can see eight
applications flow through 8 services × 16 rules × 13 agents in real time
turns a CCO's head.

**The pattern owner:** the `event-spine-ui` skill. Live SSE backbone,
stage-chip motion, event grouping, drill-into-event panel.

**The non-negotiable:** every page that displays in-flight work uses a
push channel (SSE / WebSocket). `setInterval(fetch, …)` is rejected by
ui-standards Rule 4.9.

### 2. Process as the primary metaphor

The user's mental model is the **business process**, not the platform's
5-step paradigm. A credit officer thinks "intake → spreading → policy →
drafting → approval → posting". They do NOT think "atomic services →
rules → agents → sinks". The console's structural metaphor MUST mirror
the user's mental model.

This means:

- The top-level navigation is the process, not the platform layers
- The stage rail at the top of every case page shows where the work is
  in the process (not which service is currently running)
- The vocabulary is banker / analyst / compliance officer — not engineer
- Each persona (RM, analyst, underwriter, CCO, compliance) sees the
  process from their seat

**The pattern owner:** the `process-narrative-ui` skill. Process rail,
persona switcher, banker vocabulary, banned-terms linter.

**The non-negotiable:** ui-standards Rule 4.13 — no platform jargon
("atomic service", "ADK agent", "5-step paradigm") in user-visible
strings. Lint-enforced per use case.

### 3. Agent activity is visible — live

Every agent action is **observable as it happens**. When the
risk-rater is working, the user sees a "risk-rater · running · 4.2s · 12K
tokens in" tile. When it finishes, the tile flips to a one-line summary
("Pass — Tier 1 metrics + low leverage + strong DSCR") with a
click-to-expand panel showing inputs, reasoning trace, tools invoked,
output JSON, and citations.

This is the difference between "the AI did something" and "I can see
what the AI did, why, and trust it". For banking, the second one is
the only acceptable answer.

**The pattern owner:** the `agent-activity-ui` skill. Live agent panel,
banker view ↔ engineer view toggle, replay, citations resolution.

**The non-negotiable:** every agent in `discipline_gates.audit_visible`
has a row in the audit trail with: model, latency, cost, confidence,
inputs summary, reasoning trace, tools invoked, output structured JSON,
citations.

### 4. Audit trail as standard operating procedure

The audit trail is **the export an examiner asks for**. It's not a
debug feature; it's the regulator-ready artifact. Every use case ships
the same audit-trail panel layout, the same export formats (JSON +
CSV), the same banker/engineer view toggle, the same cost+latency
totals at the top, the same filter bar.

This is the SOP — a compliance officer learns it once and uses it on
every use case. An OCC examiner asks "show me how the AI rated this
loan as Special Mention" → underwriter exports the audit trail → every
step justified, every claim cited. SR 11-7 model risk management is
the floor.

**The pattern owner:** the `agent-activity-ui` skill (audit trail is
the second half of agent visibility). Standard panel layout. Standard
JSON export schema. Standard filter UX.

**The non-negotiable:** every regulator-visible artifact has a
companion `/audit/<id>` route. The export validates against
`schemas/audit-trail.schema.json` (shared across use cases).

### 5. Human in the loop, not in the audience

The user is **in** the loop — they approve, they decline, they edit,
they override-with-reason. Every decision the agent suggests is a
*proposal*; every commit is a human action with attribution. The
console is not a dashboard the user watches; it's a workspace where
they act.

This means:

- Approval gates with explicit `approve / decline / return_for_revision`
- Edit-then-approve for memos and narratives (the agent drafts; the
  underwriter edits in place; the diff is preserved)
- Override-with-reason for risk ratings (agent says SM, underwriter
  overrides to Pass; reason captured in the audit trail)
- Dual-control for irrevocable actions (post to GL requires two
  signatures; auto-execution forbidden by CLAUDE.md)

**The pattern owner:** ui-standards (`<ApprovalGate>`) + the
`agent-activity-ui` skill (override audit). HITL patterns get a
dedicated section in `ui-standards.md` §4.X — see the gate table.

**The non-negotiable:** "Auto-execution of irrevocable actions" is
forbidden (CLAUDE.md). Every irrevocable action goes through the
approval queue with a recorded human signature.

---

## How the principles compose

A single console combines all five. The credit-memo console is the
canonical example:

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Brand]  [persona: underwriter ▾]   [Live · 11/11]  [search] [👤]     │  Principle 2 — process metaphor
├──────┬──────────────────────────────────────────────────────────────┤
│      │  Pipeline · Lincoln Electric · 25M term · BRW-LECO            │  Principle 2
│ Nav  ├──────────────────────────────────────────────────────────────┤
│      │  ⏺ intake → ◐ spreading → ⊙ policy → ⊙ drafting …            │  Principle 1 — live stage rail
│      ├──────────────────────────────────────────────────────────────┤
│      │  ┌─ Memo ─────────────────────┬─ Activity ──────────────────┐ │
│      │  │ § 1 Executive Summary       │ 14:23 · spreader · 240ms   │ │  Principle 1 — event spine
│      │  │ § 2 Borrower Overview       │ 14:23 · dscr · 180ms        │ │
│      │  │ § 3 Financial Analysis      │ 14:24 · agent: risk-rater  │ │  Principle 3 — agent activity
│      │  │ ...                         │   ⏵ Pass — Tier 1, leverage │ │
│      │  │                             │ 14:24 · agent: drafter ◐    │ │
│      │  │                             │   running · 6.8s · 12K in  │ │
│      │  │                             │ ...                         │ │
│      │  └─────────────────────────────┴─────────────────────────────┘ │
│      │                                                                │
│      │  [Audit trail] [Approve] [Decline] [Return for revision]      │  Principle 5 — HITL
│      ├──────────────────────────────────────────────────────────────┤
│      │  Risk band: 1-pass    Decision: APPROVE    Confidence: 0.91  │
│      └──────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                   [Audit trail tab]
                   13 agents · 47 tool calls · 4 rules · 73s · $0.84    Principle 4 — audit SOP
                   [Banker view] [Engineer view]  [Export JSON] [CSV]
```

Each region is owned by a skill. Together they form the contract.

---

## What "top-notch" means here

This is non-negotiable. Every screen ships with all of:

- **Live** — push channel for in-flight state; new rows fade in
- **Motion that means something** — stage chips transition 200ms ease-out;
  rows slide in 300ms cubic; alerts pulse once on arrival
- **All four states** — loading skeleton, empty, error with retry,
  populated (ui-standards Rule 4.8)
- **Banker prose, never JSON** — agent output rendered as readable
  prose with citations; never `{...}` dumped into a text field
  (product-build-discipline rules 8–10)
- **Cost + latency surfaced** — the underwriter sees that the AI cost
  $0.84 to produce this memo in 73s; this is part of the trust
- **Confidence shown** — every agent action has a confidence score; if
  it's below the use case's threshold, the row is highlighted
- **Citations resolve** — clicking a citation pops the source excerpt,
  highlighted on the source page; never a dead reference
- **Print-clean** — the memo prints to a 12-page PDF that looks like a
  banker wrote it
- **Keyboard-first** — `J/K` navigates, `Enter` opens, `A/D/R` approves
  / declines / returns, `⌘K` opens command palette
- **Empty-first design** — every screen designed for the first 5
  minutes when only 0–2 cases exist, not just for "the queue is full"

---

## How this plugs into the factory

The user-facing impact: a credit officer / RM / CCO / compliance
officer sees a console that is **alive**, **legible**, **trustworthy**,
and **defensible**.

The platform impact: every new use case in the factory inherits these
principles. The auto-invoked skills mean the team can't easily build
*around* them; the CI gates mean drift is caught at PR time. The
result is a portfolio of consoles that all feel like one product —
because they are one product.

The reuse impact: the primitives that implement the principles
(`<EventStreamPanel>`, `<AgentActivityCard>`, `<AuditTrailPanel>`,
`<ProcessRail>`, `<ApprovalGate>`) live in `ui/packages/components/`
and are imported by every use case. The Rule of Three from the
framework's reuse model: credit-memo proves the pattern; use case #2
imports it; use case #3 confirms it; thereafter it's shared
infrastructure.

---

## Skills index

| Skill | Auto-invoked when | Read full doc at |
|---|---|---|
| `agentic-ui-principles` (umbrella) | Any UI work for an agentic use case | This file |
| `event-spine-ui` | `app/api/live/*`, SSE stream files, `pipeline-activity*` | `.claude/skills/event-spine-ui/SKILL.md` |
| `agent-activity-ui` | `agent-audit/*`, `*-agent-action*`, `audit-trail*` | `.claude/skills/agent-activity-ui/SKILL.md` |
| `process-narrative-ui` | New console scaffold, `(persona)/` route groups | `.claude/skills/process-narrative-ui/SKILL.md` |
| `ui-standards` | Any file under `ui/` | `docs/methodology/ui-standards.md` |

---

## Reference

- `docs/methodology/ui-standards.md` — the design-system contract (tokens, primitives, layout, behavior gates, a11y)
- `docs/methodology/product-build-discipline.md` — the don't-repeat list (28 rules from real incidents)
- `docs/methodology/console_reference.md` — the six console patterns
- The credit-memo console at `usecases/credit-memo-commercial/ui/` and `ui/apps/pipeline-console/` is the canonical implementation. Read it before starting use case #2.
