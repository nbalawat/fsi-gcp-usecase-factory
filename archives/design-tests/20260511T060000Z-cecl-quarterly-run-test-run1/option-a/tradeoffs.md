# Tradeoffs

## What this design wins

- **One-second comprehension at executive zoom.** Allowance + delta +
  exceptions + clock are visible without scroll. If all four look
  green, the CFO clicks Approve and moves on.
- **Process metaphor stays primary.** The four-stage rail at the top
  of every page tells the executive where the run is in its OCC
  lifecycle without making her count gates or read a workflow YAML.
- **Dense detail without context loss.** Clicking a stage doesn't
  navigate; it expands inline below the still-visible rail and clock.
  No "where did I come from" back-stack problem.
- **Reuse is the default.** Nine shared primitives, seven net-new
  components, all net-new are orchestration not re-implementation.
  Total LOC for the use-case-specific layer is intentionally small.
- **Attestation surface respects irrevocability.** The ApprovalGate
  with `irrevocable: true` triggers the platform's confirmation modal
  before posting to the GL. The CFO has to confirm twice.

## What this design sacrifices

- **No live SSE stream.** Stage status is derived from events at
  render time. For a quarterly run with a 30-day clock, that's the
  right call — but it means an executive who keeps the tab open for
  20 minutes won't see new events arrive. The pipeline-monitoring
  zoom belongs to a different console.
- **Audit / story view is collapsed.** "Which agent set this PD?"
  isn't a primary affordance here. That detail belongs to the
  conversation-transcript design (option D's territory).
- **No per-cell drill into agent reasoning.** A row in the projection
  table doesn't open a side panel showing the rater's tool calls. We
  decided the executive doesn't need that — the analyst does, and
  that's a different surface.
- **Sparse hero leaves vertical whitespace.** Density-maxxed
  reviewers might want to pack more numbers into the top. Option B
  and C explore that.
- **One number, one decision.** The attestation gate accepts the full
  run as a unit. There's no per-segment "approve / reject" UI here —
  segment-level human override happens earlier in the workflow.

## Things we explicitly did not do

- We did not add a dark-mode toggle. The Atrium palette is light by
  default; a quarterly attestation isn't done at 2am.
- We did not animate the rail. Motion communicates state change, not
  decoration — the stage rail's color is the state change.
- We did not display the canvas SHA on the hero. It lives in the
  manifest; the executive doesn't need to see it on the page.
