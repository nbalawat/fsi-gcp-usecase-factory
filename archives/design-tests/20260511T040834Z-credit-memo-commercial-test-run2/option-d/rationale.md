# Option D — run 2 — rationale

## Wildcard position chosen: **provenance graph** (forensic deep-dive)

The case IS a directed acyclic graph of values. Every figure that
appears anywhere on the page — revenue, EBITDA, DSCR, risk band, final
decision — is one node. Every node has a backward chain (which
documents / services / agents produced it, including the citation
chunk_id, page, bbox, and excerpt for extracted values) and a forward
chain (which downstream values, rules, and human decisions consumed
it). The page is organized in topological bands: extracted → computed
→ decided.

The right rail is a **forensic inspector** — pick any value, walk its
full backward chain to the source document, and its full forward chain
to the credit decision.

## Why this is genuinely different from the four anchors

| Axis | Run-1 winner / sibling | Why this is different |
|---|---|---|
| sparse-density (A) | Compresses many values into glanceable KPIs | This expands EVERY value with its provenance inline — density is intentional |
| workflow-first (B) | Left-to-right stage rail dominates the page | This drops the spatial-time metaphor; topology is by data lineage, not by stage |
| inline-affordance (C) | Moves buttons next to fields | This rearranges the entire information model; the affordance change is a consequence, not the goal |
| conversation-timeline (run-1 D) | Every event is a row, in chronological order | This reorganises by **data dependency**, not by time. Two values from the same instant can be 6 hops apart in the graph |

A provenance graph is the position no other axis produces. It optimises
for a **different moment-of-truth** than the others: **post-decision
forensic audit and regulator review**. An examiner does not want a
memo PDF, and does not want a chronology — they want to point at a
number on the rating and follow the line back to the page in the
10-K it came from, and forward to the gate that signed off on it.

## How this satisfies the five agentic-UI principles

1. **Event-spine-first** — every Pub/Sub event surfaces as a provenance
   edge (service_invoked / agent_invoked become producer attributions
   on value nodes). The spine is implicit in the graph topology.
2. **Process as primary metaphor** — the process is the dependency graph
   between values, traversed by causation rather than by clock.
3. **Agent activity visible live** — every agent reasoning is a node
   (`risk-band`, `memo-narrative`) with confidence, producer, and the
   upstream values it consumed. Drill-in shows the full sub-DAG.
4. **Audit trail as SOP** — there is nothing TO audit other than this
   page; the provenance graph IS the audit artifact, regulator-ready
   by construction.
5. **Human in the loop** — HITL gates are reframed as trust
   attestations: each gate names the subtree of values the reviewer is
   signing off on, sorted lowest-confidence first so risky values get
   eyes.

## What no other axis would produce

No conversation-timeline or workflow-rail view collapses a value and
its source citation into a single card. No KPI/dashboard view shows
"this metric was consumed by these three downstream agents". The
graph metaphor is the only one that puts the citation excerpt
(chunk_id, page, bbox, excerpt, confidence) inline on every extracted
value AND names every consumer on every node.

## Reuse discipline

Six framework primitives carry the chrome and the signoff:
`AppShell`, `BreadcrumbNav`, `MetricStrip`, `StatCard`, `StatusBadge`,
`ApprovalGate`. The novelty is in orchestration: `ValueNodeCard`,
`ProvenanceGraph`, `ProvenanceInspector`, `GraphFilterTabs`,
`TrustAttestationClient` are use-case-owned and live under
`components/`. They render data and call adapters; no thresholds are
computed, no decisions are made, no ratios are calculated inside the
components.

## Typecheck status

Code is authored against `@fsi-bank/components` per the host
`tsconfig.json` (path alias `@uc/*` → `usecases/<uc>/ui/*`). All
imports resolve to existing exports in
`ui/packages/components/src/index.ts`. The mock data is imported via
relative path `../../_shared/mock-data` (read-only) so no duplicate
source of truth is created. The Dockerfile rewrites that import to
`../_shared/mock-data` at container-build time, matching the run-1
pattern.
