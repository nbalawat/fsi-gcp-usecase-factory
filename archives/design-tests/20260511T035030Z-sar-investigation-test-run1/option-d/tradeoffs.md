# Option D — tradeoffs

## Optimised for

- **Hidden-relationships surfacing.** The SAR mental model is "who is
  the subject connected to, and which of those edges are suspicious?"
  This option puts that question at the literal center of the page.
- **Selection-driven filing.** What gets filed = what's selected on
  the graph. The narrative regenerates from the selection, so there is
  no second authoring step where the investigator types the wrong
  thing or forgets a transaction.
- **Examiner explainability.** Every edge maps to one canvas event
  (`GraphEdge.idx` = event index). An examiner can cross-reference the
  graph with the audit ledger on the right rail without opening a
  separate compliance view.
- **Compliance instruments preserved.** The `RegulatoryClock` (FinCEN
  30-day window) is visible on both routes — required for SAR per the
  canvas. Rule verdicts appear as a tight tile beneath the graph, not
  as a hero.
- **Cohesion across routes.** The case-detail and approval routes share
  `CounterpartyGraph` and `NarrativeDraft` — there is no second mental
  model to learn between investigating and filing.

## Sacrifices

- **Wide viewport assumed.** The graph wants 720px+ of width. On a
  narrow drawer or mobile breakpoint it would compress; the
  case-detail layout currently degrades gracefully (graph stacks above
  the inspector rail) but is not optimised for sub-tablet.
- **No spatial pipeline-stage rail.** The investigations console
  pattern doesn't have one anyway, but examiners used to pipeline
  consoles will miss the left-to-right "alert → evidence → narrative →
  decision" rail. That ordering lives in the audit ledger instead.
- **Transaction rows are not the hero.** Investigators who prefer
  tabular wire ledgers (date · amount · counterparty · signal) will
  reach for the inspector on the right rail; the graph itself does not
  surface amounts as text labels (only on the selected edge label).
- **SAR Form 111 / PDF export is not the centerpiece.** Anyone who
  thinks of SAR investigations as "fill out the form, then sign" will
  need to re-orient: here you select the sub-graph that the filing
  pipeline will *render* into the form downstream. The form is an
  artifact, not the interface.
- **Graph layout is deterministic, not force-directed.** Nodes are
  placed on a ring around the subject — easier to read, easier to test,
  but doesn't expose cluster structure if the case has 100+
  counterparties. (Out of scope for the demo canvas; production would
  layer in clustering when N > 20.)
- **Multi-day pattern visualisation is light.** The dates appear in
  edge labels and the audit ledger but the graph itself doesn't
  encode time-of-day or temporal clustering visually. A timeline-first
  option does that better; we trade that off for relationship clarity.
- **Citation surface is implicit.** Edge metadata (latency / tokens /
  confidence) shows in the inspector, but per-row citations (PDF page +
  bbox) aren't surfaced — that's a forensic deep-dive option, not a
  graph option.
