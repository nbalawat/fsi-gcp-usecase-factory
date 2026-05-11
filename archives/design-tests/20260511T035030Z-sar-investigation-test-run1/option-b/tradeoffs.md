# Option B — tradeoffs

## Optimised for

- **Deadline awareness.** The 30-day BSA clock is the unmissable focal
  point on every page; the BSA Officer can never lose track of how
  much time the regime allows.
- **Temporal comprehension.** Cases read top-to-bottom along the
  day-since-detection axis. Sections are pre-bucketed (Day 0 / 1–3 /
  4–14 / 15–25 / 26–30) so the reader sees "what happens by when"
  without having to compute deltas.
- **Regulatory framing.** The page mirrors the BSA regime exactly:
  clock starts at detection, sections correspond to the natural rhythm
  of triage / investigate / draft / review / file.
- **Inline signoff in the shadow of the deadline.** The approval flow
  re-uses the same hero clock; the BSA Officer never leaves the
  temporal frame to sign the final SAR.
- **Cohesion across the two routes.** The case page and the approval
  page share the same hero, the same event-row primitive, and the
  same lib adapters — no second mental model to learn.

## Sacrifices

- **Per-event density** (latency ms, token counts, confidence) is
  surfaced but visually de-emphasised; a forensic engineering view
  would want them bigger.
- **The SAR narrative PDF is not the centerpiece.** Anyone who thinks
  of SAR as "approve the PDF" will need to re-orient: here you approve
  the clock-anchored sequence of events that PRODUCED the PDF.
- **Spatial process metaphor is secondary.** `WorkflowStageRail` sits
  under the clock, not in place of it; designers who want the
  pipeline left-to-right shape as the hero will reach for a different
  option.
- **Cases not yet near the deadline get less visual punch.** The clock
  band only flips amber / red as the deadline approaches; very early
  cases sit in the "ok" band, which is correct but visually quiet.
- **Day buckets are fixed.** The day ranges (0 / 1–3 / 4–14 / 15–25 /
  26–30) are part of the metaphor. Use cases with materially different
  rhythms would need different buckets — that's a per-use-case
  decision encoded in the `lib/data.ts` `SECTION_TEMPLATE` constant.
- **The clock primitive does live-ticking.** Designers wanting frozen
  fixtures in tests can pass the `now` prop (the case page does this
  for SSR determinism) — but the production view is live.
