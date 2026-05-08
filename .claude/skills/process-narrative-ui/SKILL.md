---
name: process-narrative-ui
description: The pattern for making a business process the primary metaphor of an agentic console — so the user sees the work, the stage, the agents activated at each stage, and themselves in the loop. Auto-invoked when scaffolding a new console, adding a route group `app/(<persona>)/`, working on a stage rail / process timeline / persona switcher, or editing `usecases/<uc>/ui/console.yaml`. Codifies the process-as-navigation pattern, the persona-first layout, the banker-vocabulary discipline, and the workflow-stage-rail UX that makes "what is the system doing right now" answerable at a glance.
---

# Process-narrative UI

You are about to read, write, or edit code that defines the structure
of an agentic console — its top-level navigation, its process rail,
its persona switcher, its banker vocabulary. This skill is the playbook
for **Principle 2** of `agentic-ui-principles.md`: process is the
primary metaphor, not the platform.

The credit officer thinks "intake → spread → policy → drafting →
approval → posting". They do NOT think "atomic services → rules →
agents → sinks". A console that uses the platform's nouns at the
surface level WILL look like an internal tool — and it will get
rejected by the actual user. This skill ensures the surface speaks
the user's language while the platform does its work underneath.

---

## When this skill auto-invokes

- A new console is being scaffolded (`/new-use-case` Step 4 / `/ui-standards onboard`)
- Files added under `app/(<persona>)/` route groups
- `usecases/<uc>/ui/console.yaml` is read or edited
- Files matching `*workflow-timeline*`, `*process-rail*`,
  `*stage-rail*`, `*persona-switcher*`, `*persona-topbar*` are touched
- `usecases/<uc>/ui/banned_terms.yaml` is read or edited

---

## The four levers of process narrative

Every process-narrative UI is composed of four levers. Pull all four
and the console feels like the user's tool. Pull any subset and the
console feels like a platform demo.

| Lever | What it controls |
|---|---|
| **1. Process as navigation** | The top-level menu mirrors the business process |
| **2. Stage rail** | Every case page shows position in the process |
| **3. Persona switcher** | Each role gets a tailored home + permissions |
| **4. Banker vocabulary** | UI strings linted against a per-UC banned-terms list |

---

## Lever 1 — process as navigation

The top-level navigation is **the business process**, not the platform
layers.

### Wrong

```
Nav:
  Atomic services
  Rules
  Agents
  Workflows
  Sinks
```

This tells the user nothing about their job.

### Right (credit-memo-commercial example)

```
Nav (underwriter persona):
  Pipeline           ← cases moving through stages (the queue)
  My approvals       ← cases waiting on me
  Policy library     ← reference: rules + thresholds (read-only)
  Audit trails       ← decisions I or my team made
```

The navigation is the persona's **daily routine**, in the order they
do it. A new RM looks at this and instantly knows where to go.

### Per-console-pattern templates

Six console patterns, each with a canonical navigation structure (see
`docs/methodology/console_reference.md`):

- **Pipeline** (commercial loan, mortgage, KYC): Pipeline → My approvals → Stuck cases → Audit trails
- **Investigations** (BSA/AML, disputes, complaints): Active cases → My queue → Aging → Closed
- **Real-time** (fraud, RTP, ATO): Live stream → Decline reasons → Override review → Latency board
- **Surveillance** (CRE, recon): Heatmap → Watchlist → Alerts → Acknowledged
- **Run** (CECL, RCSA, MRV): This run → Segments → Qualitative factors → Board pack
- **Recommendations** (NBA, rebalancing, RCSA): Inbox → My disposition → Closed → Reports

Each console pattern's skill (e.g. `console-pipeline`) loads the
appropriate template.

---

## Lever 2 — stage rail

Every page that shows a single case has a **stage rail at the top**
showing where the work is in the business process. Not where it is in
the platform's processing pipeline — where it is in the **business
process the user understands**.

### The components

`<WorkflowStageRail>` lives in
`usecases/<uc>/ui/components/workflow-timeline.tsx` (per-UC during
the build). Promote to `@fsi-bank/components` after Rule of Three.

Props:
- `stages: Stage[]` — ordered list of business stages with banker labels
- `currentStage: string` — which stage the case is at right now
- `decision?: "APPROVE" | "DECLINE" | "RETURN"` — final state if done
- `onClick?: (stageId: string) => void` — click to filter activity panel

### The rendering

```
⏺ Intake → ◐ Spreading → ⊙ Policy → ⊙ Drafting → ⊙ Approval → ⊙ Posting
  done       running      pending     pending      pending     pending
  ✓          12s          —           —            —           —
```

- **Done** stages: green dot, completed_at timestamp
- **Running** stage: amber pulsing dot, elapsed time, animated 200ms
  ease-out tint
- **Pending** stages: outlined ring, em-dash
- **Final state** (when `currentStage = "done"`): all dots green, plus
  a decision pill (APPROVE / DECLINE / RETURN) at the right end

### The transitions

Stages flip through the rail as the SSE stream pushes deltas. The
animation is **slow** (200ms) and **deliberate** — the user should
SEE the transition, not have it flash.

This is the lever that makes "the system is processing my application"
**visible**. Without the rail, the user has no idea what's happening.

### What "stage" means

Stage labels are the user's vocabulary, mapped to internal state in
`usecases/<uc>/ui/console.yaml`:

```yaml
# usecases/credit-memo-commercial/ui/console.yaml
process:
  stages:
    - id: intake
      label: "Application received"
      description: "Loan application submitted; awaiting first review"
    - id: spreading
      label: "Spreading"
      description: "Financial spreader + ratios + DSCR being computed"
    - id: policy
      label: "Policy checks"
      description: "Regulatory + concentration + covenants being evaluated"
    - id: drafting
      label: "Memo drafting"
      description: "13 specialist agents assembling the credit memo"
    - id: approval
      label: "Awaiting approval"
      description: "Memo ready; underwriter review needed"
    - id: posting
      label: "Posted to GL"
      description: "Approval recorded; GL posting + GCS archive complete"
    - id: done
      label: "Closed"
      description: "Final state"
```

The orchestrator's `application_state.current_stage` field carries
these IDs. The UI never displays the ID — only the label.

---

## Lever 3 — persona switcher

Every console with >1 user role is **persona-aware from PR #1**. The
route group `app/(<persona>)/` is scaffolded for each declared persona,
even if only one is implemented at first. Retrofitting personas later
costs 3× (we paid for that).

### Declaration

In `reasons.yaml`:

```yaml
discipline_gates:
  personas:
    - id: underwriter
      label: "Underwriter"
      home_route: /pipeline
      permissions: [read_case, draft_memo, approve_loan_under_5M]
    - id: cco
      label: "Chief Credit Officer"
      home_route: /portfolio
      permissions: [read_all, override_rating, approve_loan_over_5M]
    - id: rm
      label: "Relationship Manager"
      home_route: /origination
      permissions: [read_borrower, submit_application]
    - id: compliance
      label: "Compliance Officer"
      home_route: /audit
      permissions: [read_audit, sign_off, export_audit]
```

### Implementation

- **Route groups** — `app/(underwriter)/`, `app/(cco)/`, `app/(rm)/`,
  `app/(compliance)/` — each contains the persona's home + sub-routes
- **Persona switcher** — `<PersonaSwitcher>` lives in the AppShell top
  bar; cookie-persisted across sessions
- **Persona topbar** — `<PersonaTopBar>` provides persona-specific
  context (e.g. "Approving for: Senior Credit Officer queue") — owns
  the right-of-brand slot in AppShell

### Permission gating

The persona's permissions list gates which actions show up:

```tsx
// inside ApprovalGate
{persona.permissions.includes("approve_loan_over_5M") && loan_amount > 5_000_000 && (
  <Button>Approve (CCO authority)</Button>
)}
```

Server-side, the same permissions are enforced at the API route level
(`requirePermission(req, "approve_loan_over_5M")`). The UI hides
unavailable actions; the API rejects them. Never trust the UI.

---

## Lever 4 — banker vocabulary

UI strings use the **user's** vocabulary. Platform terms ("atomic
service", "ADK agent", "5-step paradigm", "rules service",
"orchestrator") are forbidden in user-visible strings.

### Per-UC banned terms

Every use case ships `usecases/<uc>/ui/banned_terms.yaml`:

```yaml
banned_terms:
  # Platform-internal nouns the user should never see
  - "atomic service"
  - "ADK agent"
  - "5-step paradigm"
  - "rules-service"
  - "orchestrator"
  - "Pub/Sub"
  - "Cloud Run"
  - "Vertex"
  - "Gemini"      # but "AI" is fine
  - "Claude"      # but "AI" is fine

  # Internal stage IDs that leaked into UI strings (lint-catch)
  - "current_stage"
  - "application_state"
  - "agent_action"

  # Use-case-specific nouns the user shouldn't see
  - "credit-memo-commercial"   # the use_case_id; users see "Credit Memo"
  - "BRW-LECO"                  # internal IDs unless surfaced as a label
```

### Mapping platform-noun → banker-noun

Maintain a mapping table in `usecases/<uc>/ui/glossary.yaml`:

```yaml
glossary:
  # platform_noun: banker_noun
  agent: "AI assistant"          # or "specialist" for agentic teams
  atomic service: "calculation"  # or "engine" for compute
  rules service: "policy engine"
  drafter: "memo writer"
  rater: "risk assessor"
  classifier: "document sorter"
  orchestrator: "workflow"
  5-step paradigm: "process"     # or just "workflow"
```

### CI gate

`scripts/test_ui_smoke.mjs --check=banned-terms` greps every
`app/**/page.tsx` (and the UC's `components/`) for any banned term,
and rejects matches not whitelisted with `// banned-term-exception:
<reason>` on the same line.

---

## Composition — the canonical credit-memo console

Walking the credit-memo-commercial console with all four levers:

```
┌──────────────────────────────────────────────────────────────────┐
│ Atrium · Credit Memo  [persona: Underwriter ▾]   [Live · 11/11]   │  AppShell + PersonaSwitcher
├────┬─────────────────────────────────────────────────────────────┤
│    │ Pipeline                                                    │  Process-as-nav
│ ▶  │ ─────────────                                               │  (the route group is /(underwriter)/pipeline)
│ ●  │ ⏺ Intake → ◐ Spreading → ⊙ Policy → ⊙ Drafting → ⊙ Approval│  Stage rail
│ ●  │   done       running                                        │
│ ●  │                                                              │
│    │ ┌─ Application 1 (BRW-LECO) ────────────────────────────┐  │
│    │ │ Lincoln Electric · $25M term · 5y                      │  │  Banker vocabulary —
│    │ │ DSCR 1.4x · Leverage 0.9x                              │  │  no "atomic service"
│    │ │ ◐ Spreading — 12s elapsed                              │  │  visible
│    │ │                                                         │  │
│    │ │ [Open] [Approve] [Decline] [Return for revision]       │  │
│    │ └────────────────────────────────────────────────────────┘  │
│    │                                                              │
│    │ ┌─ Application 2 (BRW-AAPL) ─────────────────────────────┐ │
│    │ │ ...                                                      │  │
└────┴─────────────────────────────────────────────────────────────┘
```

Each lever is doing its job:
- **Lever 1**: nav says "Pipeline" / "My approvals" / "Audit trails" — banker words
- **Lever 2**: stage rail visible at the top, animating as work progresses
- **Lever 3**: persona switcher in top bar; route group in URL
- **Lever 4**: only banker vocabulary in user-visible strings

---

## "Top-notch" checklist for process narrative

Before declaring a console scaffold done:

- [ ] Top-level nav matches the persona's daily routine (verify with a
      real user if possible)
- [ ] Stage rail at the top of every case page; transitions are
      animated (200ms ease-out)
- [ ] Persona switcher in AppShell top bar; cookie-persisted
- [ ] Route groups exist for every declared persona, even if only one
      is built first
- [ ] `banned_terms.yaml` is populated; smoke linter passes
- [ ] `glossary.yaml` is populated; agent role names map to banker labels
- [ ] No internal IDs surfaced (e.g. "current_stage" never visible;
      "BRW-LECO" only as a fine-print reference)
- [ ] Stage labels are concrete and short (≤2 words)

---

## CI gates

- **Banned-terms lint** — `scripts/test_ui_smoke.mjs --check=banned-terms`
  fails the build on any banned term in user-visible strings.
- **Persona scaffold check** — `scripts/lint_ui_personas.mjs` walks
  the `discipline_gates.personas` list in `reasons.yaml` and confirms
  every persona has an `app/(<persona>)/` route group AND a home page.
- **Stage-rail check** — every case-detail route (`app/cases/[id]/...`)
  must include `<WorkflowStageRail>`. Lint rule.

---

## Anti-patterns to refuse

- **Top-level nav uses platform nouns** — "Atomic services" / "Agents"
  / "Workflows" / "Sinks" never appear as nav items.
- **Stage rail rendered as a static image** — must reflect live state
  via SSE.
- **Persona switcher absent** — every console with >1 persona has it,
  from PR #1.
- **Stage labels are platform stage IDs** — `current_stage = "intake"`
  is fine in code; the UI shows "Application received" or equivalent.
- **Glossary not populated** — agents have role names like
  `customer-concentration-analyzer`; the UI shows "Customer concentration
  analyst" via the glossary mapping.
- **Persona switcher hides behind a settings menu** — it's top-bar,
  click-to-switch, cookie-persisted.

---

## Onboarding for a new use case

1. Pick a console pattern — see `docs/methodology/console_reference.md`.
2. Declare personas in `reasons.yaml#discipline_gates.personas`.
3. Author `usecases/<uc>/ui/console.yaml` with:
   - `process.stages[]` — ordered business stages with banker labels
   - `process.entry_stage` — the first stage (typically `intake`)
   - `process.terminal_stages` — set of done states (`done`, `cancelled`)
4. Author `usecases/<uc>/ui/banned_terms.yaml` and `glossary.yaml`.
5. Scaffold `app/(<persona>)/` for each persona; each has a `page.tsx`
   landing.
6. Use `<WorkflowStageRail stages={fromConsoleYaml(...)}>` on every
   case-detail route.
7. Run `/ui-standards check` to verify all gates pass.

---

## Reference

- Canonical implementation:
  - Console.yaml: `usecases/credit-memo-commercial/ui/console.yaml`
  - Stage rail: `usecases/credit-memo-commercial/ui/components/workflow-timeline.tsx`
  - Persona switcher: `ui/apps/pipeline-console/components/persona-switcher.tsx`
  - Persona topbar: `ui/apps/pipeline-console/components/persona-topbar.tsx`
  - Route groups: `ui/apps/pipeline-console/app/(underwriter|cco|rm)/`
- `docs/methodology/agentic-ui-principles.md` — Principle 2
- `docs/methodology/ui-standards.md` §3 (layout) and §4.13, §4.14
  (banned terms, personas)
- `docs/methodology/console_reference.md` — the six console patterns
- `docs/methodology/product-build-discipline.md` Rule 17 (no jargon),
  Rule 18 (personas first-class)
