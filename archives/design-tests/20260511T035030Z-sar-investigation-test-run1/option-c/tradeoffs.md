# Option C - tradeoffs

## Optimised for

- **Evidence transparency.** Every claim cites its source by
  construction - the drafter cannot produce an unsourced claim because
  the data model requires `citationIds`. Examiners get one-click
  drill-in to the supporting record.
- **Audit explainability.** The `EvidenceDrawer` surfaces the source
  category (TXN / ACC / GEO / AGT / SVC / RUL), a one-line title, a
  paragraph body, structured key/value fields, and a pointer back to
  the event index on the case spine. Designed for the kind of
  back-tracing an OCC examiner does in the dressing-down phase of a
  review.
- **Reading flow.** The analyst's eye never leaves the narrative line.
  The sticky right-rail drawer means the prose stays visible while the
  evidence loads alongside.
- **Inline disposition.** Three real action buttons sit under every
  claim: flag, dispute, add note. The note composer is inline (never
  modal) so the analyst stays inside the same surface they were
  reading.
- **Approval-as-narrative.** The signoff happens at the bottom of the
  same annotated document. No separate review-then-approve hop.

## Sacrifices

- **Spatial workflow metaphor is absent.** Other options (notably
  pipeline-shaped ones) surface the stages left-to-right. Option C
  drops that in favour of the document metaphor - which is the right
  call for a writing-heavy persona but the wrong call if the analyst
  needs to know "what stage are we in" at a glance. (Mitigated by the
  `StatusBadge kind="info"` in the header.)
- **Chronological event spine is implicit.** The `PIPELINE_EVENTS`
  list is the source of truth for the citations but is not surfaced
  as a transcript view. Other designer options can play that axis;
  option C does not.
- **Per-claim density is high.** The prose is dense (one paragraph per
  claim, plus the citation group, plus three inline actions, plus
  optional note composer). Density score: 4.
- **Single right rail constrains parallelism.** Only one citation can
  be open at a time. If the analyst wants to compare two pieces of
  evidence side-by-side, they must toggle between chips. A future
  iteration could allow pinning multiple citation chips into a stacked
  drawer.
- **Vertical scrolling dominates.** The case-detail and approval
  pages are tall documents. Not optimised for scanning many cases at
  once - that's the queue page's job.
- **Inline-action UX cost.** Three actions under every claim is a lot
  of repeating buttons. The visual signal is intentionally low
  (mono, ink-2, border-rule), but a power-user might prefer keyboard
  shortcuts. Not in scope for this option.
