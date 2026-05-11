# Option B — trade-offs

## Optimised for
- **Workflow-as-navigation.** The nine canvas stages drive the layout on every screen. The user never has to ask "where am I in the process?" — it's the page.
- **Pipeline traceability.** `PipelineSpine` renders every `PIPELINE_EVENT` grouped by stage as the page's backbone. Service invocations, agent runs, and human actions are surfaced without a drawer.
- **Stage-anchored deep links.** Each rail entry is a real `<a href>` that scrolls to `#stage-<id>` on case detail or `#gate-<gate>` on approval. No decorative buttons.
- **HITL gates are first-class.** The approval flow renders all four gates (`extraction_review`, `rating_review`, `draft_review`, `final_approval`) as a sequential chain, each backed by the shared `ApprovalGate` primitive — live for the first pending gate, decided-summary for the rest.
- **Reuse-first.** 8 shared primitives (`AppShell`, `BreadcrumbNav`, `MetricStrip`, `StatCard`, `StatusBadge`, `StepProgress`, `AgentMini`, `ApprovalGate`) carry the heavy lifting; UC code is composition + canvas vocabulary.

## Sacrifices
- **Artifact body isn't the hero.** The credit memo's prose isn't the page; the stage is. Analysts who want a single-pane "read the memo" mode will prefer option C or D.
- **Three persistent bands.** Rail + spine + hero are always visible. The density score is 3 — moderate — not 4 or 5. Power users on small screens will see less artifact content per row.
- **Sequential gates, not a rule grid.** A credit officer who wants every threshold in one scannable table will need to scroll past the chain. We made the trade because the workflow-first metaphor demands a gate-by-gate cadence.
- **No deep memo editing.** This proposal does not embed the WYSIWYG memo editor — the focus is on workflow state and approval, not authoring. The drafting stage shows a summary, not the full document body.
