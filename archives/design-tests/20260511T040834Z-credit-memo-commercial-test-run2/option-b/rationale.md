# Option B — rationale

## Metaphor chosen: **workflow-first**

The workflow IS the page. Stages drive layout: the current stage is the
hero (~60% of viewport at `lg+`), prior stages compress to a left rail
with status pills, future stages are dimmed but visible on the right.
The shared `WorkflowStageRail` sits above as the spine.

The reviewer always has the answer to "where am I in this case?" — it's
the highlighted cell on the rail. The hero shows what's happening RIGHT
NOW, without forcing the reader to scroll past stages that already
finished or guess at stages that are still queued.

## Why workflow-first satisfies the five agentic-UI principles

1. **Event-spine-first** — `PIPELINE_EVENT`s populate each stage bucket;
   the rail counts events per stage; the hero lists them as they fired.
2. **Process as primary metaphor** — the process IS the layout. The
   pipeline rail is the navigation; clicking a prior stage expands its
   bucket; the hero is always the active stage.
3. **Agent activity visible** — the `StageEventList` surfaces every
   `agent_invoked` event with tokens-in/tokens-out; the shared
   `PipelineMini` on the right surfaces the 5-step paradigm view.
4. **Audit trail as SOP** — every event in the bucket carries timestamp,
   actor, latency, tokens; nothing is hidden behind a drawer.
5. **Human in the loop** — HITL gates appear as a list under the hero;
   pending ones get an "Open" affordance routing to the approval flow,
   which keeps the same spine so the reviewer never loses workflow
   context.

## Reuse discipline (Rule 42)

**Eight shared primitives** carry the chrome and the load-bearing axes:

- `AppShell` — required root wrapper (Section 2 of `ui-standards.md`)
- `BreadcrumbNav` — back-to-floor + case identity
- `WorkflowStageRail` — the SPINE; renders every stage with the active
  one highlighted via the primitive's built-in `currentStage` prop
- `MetricStrip` + `StatCard` — counts (never math)
- `StatusBadge` — used everywhere a verdict / status appears
- `PipelineMini` — the platform's 5-step paradigm anchor
- `ApprovalGate` — the only place a HITL gate disposition is captured

The novelty is in the **stage-bucketing orchestration**: `StageHero`,
`StagePriorRail`, `StageFutureList`, `StageEventList`,
`GateRespondClient`. They render data shaped by `lib/data.ts` — no
thresholds computed, no decisions made, no ratios calculated.

## Same-axis variation

The variation axis is **metaphor**. The seed prompt anchors on
"workflow as primary spatial metaphor". This option commits to that:
the workflow rail is REQUIRED (Tier 3 hard-constraint #5 lists
`WorkflowStageRail` as the perfect-fit shared primitive for this
metaphor — used). Stages bucket the events; the active stage is the
hero; the rail's `currentStage` prop drives the visual emphasis.

## Typecheck status

Code authored against `@fsi-bank/components` per the host's path
alias (`./_vendor/components/src/index.ts`). All imports resolve to
exports in `ui/packages/components/src/index.ts`. The mock data is
imported via the relative path `../../_shared/mock-data` (read-only)
per the constraint — no duplicate source of truth. Standalone build:
the Dockerfile vendors the components package at build time and
rewrites the shared-mock relative path so the standalone bundle
resolves cleanly.
