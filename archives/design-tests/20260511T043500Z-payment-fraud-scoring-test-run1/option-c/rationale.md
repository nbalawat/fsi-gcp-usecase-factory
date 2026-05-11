# Option C — decline-reason-actionable

## The problem

Real-time payment fraud at scale produces thousands of declines an hour.
The fraud analyst can never approve them one by one; the analyst's job
is to *tune the model* from the decline stream. The console that helps
them do that has to put the tune affordance where the decline reason
already is.

## The decision

For every declined (or step-up-routed) transaction, surface the decline
reasons as individual cards. On each card, render the tune actions
inline:

- **Override · this customer** — accept and pin a customer-scoped allow
- **Allowlist · this merchant** — accept and pin a merchant-scoped allow
- **Tune · threshold** — open the rule's threshold tuner
- **Step-up · 3DS** — route to 3DS challenge

No hop to a side panel. No modal. No bulk-only flow. The affordance is
next to the reason — `affordance_pattern = inline-per-section`.

## Two routes, one surface

| Route | What it shows |
| --- | --- |
| `case/[id]` | A single transaction. Full reason explanations, full meter strip, processing transcript on the right, reason index on the side. |
| `approval/[id]` | The bulk decline-stream tuning surface. Every row is itself a stack of inline-action reason cards; a focus param keeps the row that was last seen on top. |

The same primitive (`DeclineReasonActions`) renders both, with a `compact`
prop that drops the explanation paragraph in the bulk view.

## Reuse floor

Five shared primitives carry the foundation:

1. `AppShell`
2. `BreadcrumbNav`
3. `MetricStrip`
4. `StatCard`
5. `StatusBadge`

The use-case primitives compose them: `DeclineReasonActions` uses
`StatusBadge` for the source chip; `CaseDisposition` and `DeclineStream`
both wrap `DeclineReasonActions`. The reuse goal — write each primitive
once, use it everywhere — is met.

## Hard rules verified

| Rule | Decision |
| --- | --- |
| AppShell-rooted | Yes — both routes render `AppShell`. |
| No arbitrary Tailwind values | All sizes drawn from default Tailwind spacing scale; no `w-[...]` literals. |
| No bare interactive elements | Every clickable is `<button type="button" onClick=…>` or `<a href=…>`. |
| Client components marked | `DeclineReasonActions`, `DeclineFilterBar`, `DeclineStream`, `DeclineStreamRow`, `CaseDisposition` all start with `"use client";`. |
| Mock data read-only | Re-exports from `_shared/mock-data.ts`; no in-place mutation; no fixture writes. |
| Five+ shared primitives | Five shared primitives plus the use-case composition layer. |
