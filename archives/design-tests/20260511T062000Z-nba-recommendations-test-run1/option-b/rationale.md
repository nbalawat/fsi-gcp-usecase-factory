# Option B — rationale

## Variation axis chosen: **metaphor (customer relationship as narrative)**

The seed for option B asked for a narrative shape: each card carries the
customer's recent activity timeline + the agent's recommendation in
first-person, plain English ("I noticed Acme Corp drew on their line 3
times in the last 30 days. Their cash runway is now 90 days. Consider
proposing a $5M extension before they shop competitors."). The RM reads
stories, not data tables. Confidence + evidence chips support the
story; the disposition gate acts on the story.

Three explicit consequences flow from this:

1. **The unit of work is a relationship-story, not a data row.** A
   `NarrativeCard` is the screen's atom. It carries a serif headline,
   the agent's prose narrative, the customer's recent activity timeline,
   the proposed action, the expected impact, and the supporting evidence
   — all in one card, in one column.

2. **The disposition gate is in the story, not a separate screen.** The
   shared `ApprovalGate` primitive (Accept / Edit / Defer / Reject)
   renders at the bottom of the case detail's narrative card. There is
   no "review then approve" hop — the act of accepting happens in the
   same surface that delivered the story.

3. **The right rail tells the RM about themselves.** Per the
   recommendations console spec, calibration is the feature: the RM
   sees their own accept / edit / defer / reject pattern over 30 days,
   the agent's learning from their rejections, and the safety rails
   that gate every recommendation before it draws breath.

## Why narrative satisfies the five agentic-UI principles

1. **Event-spine-first** — the timeline IS the event spine, shown
   inside every card. Each ledger event is a one-line story.
2. **Process as primary metaphor** — the process is "the relationship
   moved → agent noticed → agent drafted → RM decides → routes
   downstream". The card walks the reader through that process.
3. **Agent activity visible live** — the story is in the agent's voice;
   confidence is the leftmost chip; the agent's learning panel is
   always visible.
4. **Audit trail as SOP** — every accept routes through the shared
   ApprovalGate, which logs the disposition + comment. The transcript
   is the audit.
5. **Human in the loop** — Accept is never auto-execution; the gate
   routes to the named queue ("RM outreach", "FX desk handoff"), never
   to a "go" button.

## What no other designer would do here

No other axis collapses the whole recommendation onto a serif narrative
column. Density-first would foreground a 12-column financials table.
Affordance-first would float a side-rail of accept/reject buttons.
Wildcard would invent a new shape (a chat thread, a kanban). The
metaphor axis is the one that says: **the customer is the metaphor,
the story is the page**, and means it.

## Self-contained build (Rule 38)

Hard constraint: NO `_vendor` symlinks, post-build cleanup. Implemented:

- Six shared primitives (`AppShell`, `BreadcrumbNav`, `CaseCard`,
  `MetricStrip`, `StatusBadge`, `ApprovalGate`) are **inlined** under
  `components/primitives/`. Each file carries a header comment
  declaring its provenance against `ui/packages/components/src/<name>.tsx`.
  Manifest tracks them as `source: shared` (the discipline is whether
  the bank treats it as shared — it does — not whether the bytes are
  re-imported from a workspace package).
- The data layer (`lib/data.ts`) is local; no `_shared/mock-data.ts`
  dependency. nba-recommendations-test does not yet ship a generated
  shared mock module, and the constraint forbids us from inventing
  one. The canvas SHA-256 is pinned in `CANVAS_SHA256`.
- The Dockerfile copies ONLY the option directory; no workspace COPY,
  no `sed` rewrite step. `npm install && next build` from inside the
  option produces a standalone bundle.

## Reuse discipline

Six framework primitives carry chrome + disposition. Five use-case
components carry novelty:

- `NarrativeCard` — the relationship-story atom (built on top of
  shared `CaseCard`)
- `CustomerTimeline` — the recent-activity ledger inside each card
- `EvidenceChips` — the supporting chips row (built on top of
  shared `StatusBadge`)
- `DispositionClient` — Server/Client boundary for `ApprovalGate`
- `RightRail` — review pattern + agent learning + safety rails

This is `≥5 shared` + `5 use-case`, well above the reuse floor.

## Typecheck status

The proposal is authored against the local `tsconfig.json` which sets
`@/*` to the option root. Imports resolve to inlined primitives under
`components/primitives/`. `tsc --noEmit` is the gate; `next build`
ignores TS errors during the proof build per the parent flow's policy
(`next.config.mjs` carries `typescript.ignoreBuildErrors: true`).
