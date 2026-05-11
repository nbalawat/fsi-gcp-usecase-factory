# Option D — rationale

## Wildcard position chosen: **conversation timeline**

The case IS a transcript. Every event in `PIPELINE_EVENTS` becomes one
chronological row — agent reasonings (◆), atomic service calls (▢),
human uploads (◉), HITL gates (▮), system stage transitions (·).
Reading the case top-to-bottom is reading the case's story.

This is the position no other designer is likely to take. The other
three options on the same canvas almost certainly anchor on:

- a **document-first** memo view (the artifact is the page, agents are
  hidden under a "show reasoning" affordance),
- a **workflow-first** stage rail (the pipeline's left-to-right shape
  is the page, the memo is a panel), or
- a **data-first** KPI/table view (DSCR, leverage, exposure are the
  hero, decisions are footnotes).

A conversation-first view is genuinely orthogonal. It optimises for a
DIFFERENT moment-of-truth than the others: **post-decision review and
live audit**. The risk officer doesn't want a memo PDF — they want to
read what the system did, in order, with every actor named. The
analyst signing off on a gate doesn't want to context-switch into a
separate approval app — the gate IS a row in the transcript, and
"Respond →" jumps them into the slice of conversation that led to it.

## Why conversation-first satisfies the five agentic-UI principles

1. **Event-spine-first** — the spine IS the page. Every Pub/Sub event
   shows up as a row.
2. **Process as primary metaphor** — the process is the transcript; the
   reader walks through it in time, not in space.
3. **Agent activity visible live** — every agent invocation is its own
   row, with tokens-in/tokens-out and a ref for drill-in.
4. **Audit trail as SOP** — the audit trail isn't a separate "compliance
   view"; it's the only view. There is no other thing to audit.
5. **Human in the loop** — HITL gates appear inline; pending ones get a
   "Respond" affordance; completed ones show the decision verb.

## What no other designer would do here

No other axis produces this artifact: a case page where the agent
reasonings, the service calls, the rule verdicts, and the human
approvals are all the same kind of object — a row — and the act of
approving a gate happens in the same view that the audit will later
read. Density-first compresses; metaphor-first picks a spatial
metaphor; affordance-first moves the buttons around. None of them
collapses the whole case onto a single time axis.

## Reuse discipline

Five framework primitives (`AppShell`, `BreadcrumbNav`, `MetricStrip`,
`StatCard`, `StatusBadge`, `ApprovalGate` — six in total) carry the
chrome and the signoff. The novelty is in orchestration: `CaseTranscript`,
`TranscriptRow`, `ActorFilterBar`, `GateLedger`, `GateRespondClient`
are use-case-owned and live under `components/`. They render data,
nothing else — no thresholds computed, no decisions made, no ratios
calculated.

## Typecheck status

Code is authored against `@fsi-bank/components` per the host
`tsconfig.json` (path alias `@uc/*` → `usecases/<uc>/ui/*`). All the
imports resolve to existing exports in
`ui/packages/components/src/index.ts`. The mock data is imported via
relative path `../../_shared/mock-data` (read-only) so no duplicate
source of truth is created. Local `tsc --noEmit` was not run inside
this worktree because the proposals directory is not wired as a
standalone Next app; the parent agent's typecheck (which compiles the
host pipeline-console with the UC path alias pointing at this option)
is the authoritative gate.
