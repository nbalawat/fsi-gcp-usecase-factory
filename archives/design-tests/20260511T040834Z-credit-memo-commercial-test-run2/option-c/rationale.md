# Option C — rationale

## Variation axis: affordance — inline-per-section

The seed is the brief: "Decisions live next to the data that informs
them. Inline approve / reject / edit / request-revision per section; no
sticky bottom bar; no modal drawer. The user's eye never has to leave
the section to act on it. Each section of the memo ends with the
action it enables."

Option C takes that brief literally and makes **section** the unit of
human disposition. The memo is partitioned into five sections that
correspond exactly to the canvas's workflow stages and HITL gates:

| # | Section                       | Closes the gate     |
|---|-------------------------------|---------------------|
| 1 | Borrower & documents          | (no gate — intake)  |
| 2 | Document extraction           | extraction_review   |
| 3 | Financial spread & rating     | rating_review       |
| 4 | Memo draft                    | draft_review        |
| 5 | Final approval                | final_approval      |

Every gated section ends with one shared component — `SectionAffordanceRow` —
that renders four real buttons in a row: **approve**, **edit & approve**,
**request revision**, **reject**. Three of them ("edit", "request
revision", "reject") expand a textarea inline because the audit trail
needs the reason; "approve" is a one-click action unless the gate is
irrevocable (only `final_approval`), in which case a confirm strap
appears before the post.

## Why inline-per-section satisfies the five agentic-UI principles

1. **Event-spine-first** — every section's evidence list is rendered
   directly from `PIPELINE_EVENTS`; agent/service/extract/rule rows
   share one shape. No event is invented, no event is dropped. The
   spine drives the page.
2. **Process as primary metaphor** — the five sections ARE the
   process. The right-rail `SectionNav` is the spatial overview; the
   evidence rows are the temporal detail; the affordance row is where
   the human enters the loop.
3. **Agent activity visible live** — `agent_invoked` rows render
   tokens-in / tokens-out / agent ref inside the section that
   consumed them, so each section answers "which agents did I trust
   to produce this?"
4. **Audit trail as SOP** — the audit trail is the section evidence
   list. Drilling into a row exposes its ref (service id, agent id,
   rule id). The reviewer's posted disposition becomes a new evidence
   row on the next pass.
5. **Human in the loop** — disposition lives at the bottom of each
   section, never on a separate page. Per the canvas's HITL contract,
   final_approval is irrevocable; the row enforces a confirm strap
   before posting.

## What no other designer will do here

The four variation axes on this canvas push designers toward four
distinct shapes:

- A **density** designer compresses everything into one table-like
  view (DSCR, leverage, exposure as columns).
- A **metaphor** designer leans on a spatial pipeline rail and
  navigates left-to-right.
- A **wildcard** designer (option D) collapses the whole case onto a
  single chat-style transcript.

Option C's section-per-gate affordance is the only shape that puts the
**decision** at the centre. The other axes treat the decision as
something that happens AFTER you read the memo. Option C makes the
decision the closing punctuation of every section.

## Reuse discipline

Five shared primitives carry the shell and chrome:

- `AppShell` — root for both routes (Section 3.1 of ui-standards)
- `BreadcrumbNav` — usecase / case / borrower trail
- `MetricStrip` — five surface counts on the case page
- `StatCard` — the canvas-SHA pin in the right rail
- `StatusBadge` — used inside every UC component for section status

Six use-case components carry the inline-per-section semantics:

- `MemoSection` — server-rendered section wrapper (header + evidence + affordance)
- `SectionAffordanceRow` — the four-button client island, with comment + confirm states
- `EvidenceList` — typed pure-presentation list of evidence rows
- `SectionNav` — right-rail anchor nav (`<a href="#section-…">`)
- `BorrowerFactSheet` — borrower identity rendered inside the borrower section
- `RuleVerdictPanel` — pre-computed rule verdicts rendered inside the final section's sidebar

All inputs to `SectionAffordanceRow` are pre-shaped by the adapter
(`partitionSections`) — no business logic, no math, no thresholds
computed in components.

## Hard-rule compliance

- AppShell-rooted: both pages render `<AppShell>` at the root of their
  return tree.
- No arbitrary Tailwind: every utility used resolves to a token in
  `tailwind.config.ts` (no `w-[68px]` or other `[…]` literals).
- No bare interactive elements: every `<button>` carries `type="button"`
  + `onClick`; every nav item is an `<a href>`.
- Client components carry `"use client";` directives — only
  `SectionAffordanceRow` is a client island, and the rest of the tree
  is server-rendered. The page hands the client island into the server
  `MemoSection` via the `affordance` slot — exactly the "boundary in a
  client child" pattern called out in ui-authoring.
- Read-only mock data: `_shared/mock-data.ts` is imported once into
  `lib/data.ts` and re-exported. No duplicate source of truth.

## Typecheck status

Code is authored against the standalone `tsconfig.json` (path aliases
`@fsi-bank/components` → `./_vendor/components/src/index.ts`). The
Dockerfile vendors `ui/packages/components/src/` at build time. All
imports resolve to existing exports verified against
`ui/packages/components/src/index.ts`.
