# Tradeoffs — option D

## Optimised for

- **Defensibility to regulators.** Every finding carries its citation
  chain inline; an OCC examiner can read any single page and prove the
  chain of custody. No "trust the dashboard" — every claim sources
  itself.
- **Audit-pack export discipline.** Because the page is already shaped
  like an exam report, the export-to-PDF path is essentially "render to
  print stylesheet" — no separate report-generation pipeline needed.
- **Reviewer accountability.** The HITL flow is framed as a supervisory
  finding requiring disposition. The irrevocable
  `book_specific_reserve` gate explicitly names the GL impact in the
  confirmation modal — no surprises post-click.
- **Banker-readable rule names.** Every threshold has a plain-English
  label and a citation; the bank-policy section is right there.

## Sacrifices

- **Portfolio breadth.** This surface is single-facility-deep; there is
  no map, no density grid, no portfolio-wide heatmap. A user who walked
  in wanting to see "all 240 facilities at once" would need to bounce
  back to a separate portfolio console (out of scope per prompt).
- **Real-time density.** The audit ledger is point-in-time. There is no
  live event SSE stream, no animated "agent thinking right now" tile —
  the page is a record, not a live feed. (A production version would
  add an SSE strip at the top of `/case/[id]`, but it would feed the
  same audit ledger.)
- **Speed for repeat reviewers.** A bullpen reviewer rapid-firing
  through 20 facilities/hour would find the prose-format page slower
  than an inline-accept grid. The fourth-position commitment is to
  examiner defensibility, not throughput.
- **Visual variety.** The page is mostly tables and prose by design.
  There are no charts, no maps, no spark gauges beyond the StatCard
  sparklines on the home page. The page reads like a regulatory
  document because that's the metaphor.
- **Decision automation.** No "auto-accept high-confidence findings"
  affordance. Every gate flows through the same confirmation surface —
  a deliberate choice that biases toward reviewer review (slow) over
  reviewer throughput (fast).

## What this option is NOT for

- A first-line monitoring queue where the reviewer disposes of 50
  flags per hour. (Use option with inline-action grid.)
- A geographic concentration view where the user thinks in maps.
  (Use the map-first option.)
- A surveillance-density dashboard for the CCO's morning standup.
  (Use the density-grid option.)

## Build verification

`npx next build` ran in the worktree; standalone output produced. The
Dockerfile vendors `@fsi-bank/components` and `_shared/mock-data.ts`
at COPY time per Rule 38.
