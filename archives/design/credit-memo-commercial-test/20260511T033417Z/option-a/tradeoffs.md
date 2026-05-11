# Option A — tradeoffs

## Optimised for

- **30-second executive scan.** Decision verb at 96px serif. Rationale at h4. Everything else is fact-table or rail. The Credit Officer can decide whether to descend before the page finishes scrolling.
- **Approval as a single linear motion.** One column, four gates, three of them collapsed. The active gate is the only attention sink. Final approval is irrevocable and routes through `ApprovalGate`'s confirm dialog.
- **Heavy reuse of shared primitives.** `ApprovalGate`, `StatusBadge`, `StatCard` carry the load; the option-a components are five thin wrappers. No bespoke design system.
- **Document-first metaphor.** The page is the memo recommendation card, not a dashboard around it. Chrome is 56px top + 240px right.

## Sacrifices

- **Live agent activity is hidden by default.** No reasoning panel, no event stream tile on the case page. An executive who *wants* to see why the agents agreed has to expand the citations `<details>` and navigate elsewhere — option-a explicitly trades depth for speed.
- **No multi-agent pattern visualisation.** `AgentMini` / `AgentChain` are not surfaced. Option-a assumes the analyst has already cleared the upstream gates and the Credit Officer is not auditing the agents on this screen.
- **No process timeline.** `WorkflowStageRail` is not on this page. The right-rail HITL gate strip stands in. Users who want stage history navigate to the floor view.
- **One row of stats only.** Three cards: revenue, debt, FCF. No DSCR, leverage, single-borrower-pct on the case page — those live in the rule strip as pass/watch verdicts. A denser variant (option-b or -d) would surface the ratios; option-a deliberately doesn't.
