# Option D — rationale

## Wildcard position chosen: **counterparty-graph-first**

The SAR case IS the related-parties graph. The case subject sits at
the center node. Every transaction in `PIPELINE_EVENTS` becomes one
edge fanning out to a counterparty (service-result, agent finding, or
external party). The BSA investigator clicks edges to add them to the
SAR narrative selection — and the narrative draft regenerates, live,
from that selected sub-graph. Filing the SAR is freezing the
sub-graph and signing off.

## Why this is the defensible 4th position

SAR investigations are fundamentally about **hidden relationships**.
Banks file SARs because parties are connected in ways that *look like*
structuring or laundering — money moves between accounts the customer
didn't disclose, or aggregates across counterparties in patterns the
alert engine flagged. Every BSA officer interview I've read describes
the same mental model: *"Show me who's talking to who, and which of
those edges are the suspicious ones."*

The other three designer agents on this canvas almost certainly anchor
on:

- a **timeline-first** view (regulatory clock dominates the page, events
  scroll past),
- a **narrative / form-first** view (the SAR Form 111 PDF is the page,
  agents are hidden under "show reasoning"), or
- a **tag-and-filter alert-feed** view (transactions arrive as a feed of
  cards the investigator tags + bundles).

None of those collapses the case onto a single related-parties graph,
because none of them treats *the network itself* as the page. That's
the defensible 4th axis: **the graph IS the investigation; selection IS
the filing scope; the narrative is *derived*, not authored**.

## Why counterparty-graph-first satisfies the five agentic-UI principles

1. **Event-spine-first.** Every Pub/Sub event in `PIPELINE_EVENTS`
   becomes exactly ONE edge on the graph (or one self-loop for
   stage/document events) AND ONE row in the audit ledger.
   `GraphEdge.idx` is the canonical key shared between the two
   surfaces, so the spine is preserved.
2. **Process as primary metaphor.** The process here isn't a
   left-to-right rail (that's a pipeline metaphor, wrong shape for
   investigations). The process is *expansion* — the investigator
   starts at the subject and walks outward through the network. The
   "stage" advances are visible as system-event self-loops *and* as
   audit-ledger rows.
3. **Agent activity visible live.** Each `agent_invoked` event becomes
   its own dashed-edge + agent-shaped node. Tokens-in/tokens-out and
   reasoning ref appear in the inspector when the agent node is
   selected — drill-in without leaving the page.
4. **Audit trail as SOP.** The audit ledger is in the right rail of
   the case page, scrollable, examiner-ready. Every row has actor,
   timestamp, headline. It isn't a separate "compliance view" — it's
   bolted to the graph by edge index, so an examiner can move
   freely between the two views.
5. **Human in the loop.** The HITL gate (`final_approval`) is wired
   through the shared `ApprovalGate` primitive. It carries
   `irrevocable: true` (filing a SAR is irreversible). The signoff
   sits inline at the bottom of the filing-scope view; the investigator
   never leaves the same mental model.

## What no other designer would do here

No other axis produces this artifact: a SAR investigation page where
*every* canvas event is a visible edge, where edge selection drives the
narrative, and where filing is signing off on the sub-graph rather
than on a memo. Timeline-first compresses everything onto a vertical
axis; narrative-first hides the network behind a form; alert-feed
loses the relationship topology. Only graph-first puts the *bank's
reason to file* (relationships among parties) at the center.

## Reuse discipline

Seven shared primitives (`AppShell`, `BreadcrumbNav`, `MetricStrip`,
`StatCard`, `StatusBadge`, `ApprovalGate`, `RegulatoryClock`) carry the
chrome, the regulatory clock, and the signoff. `RegulatoryClock` is
load-bearing for this use case (FinCEN 30-day window) and would have
been wasted on credit-memo's commercial-credit context.

Six use-case-owned components (`CounterpartyGraph`, `EdgeInspector`,
`NarrativeDraft`, `AuditLedger`, `GraphInvestigationClient`,
`SarFilingClient`) live under `components/`. They render data,
nothing else — no thresholds computed, no decisions made, no math.
The graph topology is built deterministically by
`toCounterpartyGraph()` in `lib/data.ts`: every event becomes one
edge, no event is dropped, no edge is invented.

## Compliance constraints respected

- **Read-only mock data** — `lib/data.ts` re-exports from
  `_shared/mock-data.ts`; no values are computed there.
- **Auditor canvas checksum pinned** — `manifest.yaml` echoes
  `650233de013e5badb28ffd95dc9b9e36ee44c84d72e1a30ed01ad9ed2bd9a8c1`
  verbatim per task contract.
- **Decision math kept out of components** — `RECOMMENDATIONS` in
  the approval page is fixed canvas copy; the `ApprovalGate` primitive
  is rendered with that recommendation pre-shaped.
- **Irrevocable action wired** — `irrevocable: true` is set on the
  final_approval recommendation (Rule 7 / forbidden-pattern compliance).
- **Five agentic-UI principles** — addressed point by point above.

## Typecheck status

Code is authored against `@fsi-bank/components` per the host
`tsconfig.json` (path alias `@uc/*` → `usecases/<uc>/ui/*` at the host
level; vendored `_vendor/` at standalone build time). All imports
resolve to existing exports in `ui/packages/components/src/index.ts`.
The mock data is imported via relative path `../../_shared/mock-data`
(read-only) so no duplicate source of truth is created.
