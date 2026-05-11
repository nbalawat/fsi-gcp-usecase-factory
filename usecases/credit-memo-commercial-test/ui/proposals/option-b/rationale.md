# Option B — workflow-first rationale

Credit underwriting is, structurally, a workflow problem. Lincoln Electric's
$25M revolver moves through nine stages — intake, extracting, analyzing,
spreading, rating, drafting, reviewing, approval, done — and four
human-in-the-loop gates. The analyst's and credit officer's
mental model is the **stage**: "where is this case in the process, and what
am I being asked to do next?" Every previous credit-memo UI we shipped
treated the artifact (the memo PDF) as the page, then bolted on a status
strip; the user had to translate "I'm looking at a memo" back to "we're at
the draft-review gate." Workflow-first flips that: the workflow IS the page.

Concretely, this proposal gives the current stage 60% of the viewport (the
`CurrentStageHero`), compresses prior stages into a left rail of status pills
(`StageRail`) so they're one click away, and dims-but-shows future stages so
the user can scout what's coming. The pipeline-event spine (`PipelineSpine`)
runs across the top as the page's backbone — not a drawer — so "what just
happened in this case" is visible without a click. The approval page reuses
the same chrome (rail + spine + hero) but pins the hero to the approval
stage and renders a `GateChain` of all four HITL gates sequentially, each
backed by the shared `ApprovalGate` primitive that already enforces
comment-required, irrevocable-confirm, and authority labels per
`ui-standards.md`. The result is two routes that answer the three
workflow-first questions — "what stage am I in, what just happened, what's
next" — at a glance, on every screen.

## Typecheck notes

This proposal imports from `@fsi-bank/components` (the shared package) and
from the canvas mock-data under `../../_shared/mock-data.ts`. The
proposal's own `tsc --noEmit` requires the pipeline-console tsconfig (or
the proposal's own equivalent) to map `@fsi-bank/*` and to include the
proposal sources. The comparator-deploy pipeline rewrites the host
tsconfig's `@uc/*` alias to point at this proposal at build time; nothing
in `app/`, `components/`, or `lib/` introduces business logic, so the only
typecheck risks are the path alias and the `defensive` event shape
(PipelineEvent is the union of mock-data entries; we narrow at the use
site).
