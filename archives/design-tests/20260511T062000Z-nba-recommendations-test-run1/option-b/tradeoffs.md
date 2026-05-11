# Option B — tradeoffs

## What option B optimises for

- **Comprehension by a busy RM**: the page reads like a memo, not a
  query result. One column, serif body, short paragraphs.
- **Trust in agent recommendations**: every story is supported by
  evidence chips. Confidence is always visible. Safety rails are shown
  in the right rail, not hidden.
- **Inline disposition**: the gate is at the bottom of the same card
  that delivered the story. Accept never auto-executes — it routes to a
  named queue.
- **Calibration loop**: the right rail shows the RM their own pattern
  back to themselves and tells them what the agent learned from their
  recent rejections.
- **Self-contained build**: no `_vendor` symlinks. Six shared primitives
  inlined as copies under `components/primitives/`. Cloud Run image
  builds from the option directory alone.

## What option B sacrifices

- **Triage at scale**: 50+ items in one column is heavy. Option B is
  optimised for ≤ ~12 stories at a time; beyond that, density-first
  designs (compact grid, sortable columns) win.
- **Side-by-side comparison**: the narrative shape resists "compare
  three customers' DSCR at once". Option B's value is depth, not
  breadth.
- **Numeric precision in the headline**: the prose narrative does not
  surface specific numbers above the fold the way a KPI strip does. The
  MetricStrip at the top of each detail page recovers some of this,
  but the story is the page.
- **Workflow stage rail**: there is no left-to-right pipeline rail. The
  recommendations console is on-demand, not multi-day flow — the absence
  is intentional.

## Where option B differs from a hypothetical density-first proposal

| dimension                    | density-first | narrative (B)  |
|------------------------------|---------------|----------------|
| primary atom                 | row in table  | story in card  |
| number of items above fold   | 10-20         | 2-3            |
| key affordance               | sort / filter | read top-down  |
| confidence                   | numeric cell  | leading chip   |
| disposition location         | column button | bottom of card |
| reading mode                 | scan          | read           |

## Failure mode

The narrative shape relies on the agent's prose being good. If the
agent writes vapid stories ("Acme Corp may have an opportunity"), the
RM will lose patience faster than they would with a row in a table.
Mitigations:

1. The mock data is high-information ("Drew $1.2M on revolver", "DSO
   crept to 58 days"); the agent prompts should be tuned to that bar.
2. The evidence chips force the agent to enumerate the signals it
   used; vapidity is harder when the chips have to support the prose.
3. Rejection capture in the ApprovalGate gives the agent immediate
   feedback when the RM finds the story unconvincing.
