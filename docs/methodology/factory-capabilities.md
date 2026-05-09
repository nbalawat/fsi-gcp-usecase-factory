# Factory capabilities — what to reuse for use case #2 → #100

This is the entry point for every new use case after credit-memo-commercial.
The bank's investment in that first use case produced reusable assets at
five layers; each new UC plugs into them rather than rebuilding.

## How to use this document

When you start a new use case (`/new-use-case <uc>`):
1. Read the rows below relevant to your domain.
2. For each "Reusable" asset, USE IT — don't fork.
3. For each "Per use case" asset, AUTHOR your own version using the
   pattern documented in the linked skill.

## Layer 1 — Atomic services (5 instead of N)

| Asset | Reusable? | Skill |
|---|---|---|
| `services/atomic/document-extractor` | YES — call from your workflow | `document-extraction-pipeline` |
| `services/atomic/financial-spreader` | YES if your UC has financials | (none — direct use) |
| `services/atomic/loan-serviceability` | YES if your UC needs DSCR / covenants | `service-consolidation` (pattern) |
| `services/atomic/peer-and-industry-context` | YES if your UC needs NAICS-driven context | `service-consolidation` (pattern) |
| `services/atomic/collateral-valuator` | YES if your UC has collateral | (none — direct use) |
| `services/atomic/borrower-network` | YES if your UC needs exposure / Reg O | `service-consolidation` (pattern) |
| `services/atomic/<your-domain>-X` | NO — author per use case | `service-consolidation` (when merging) |

## Layer 2 — Shared infrastructure

| Asset | Reusable? | Skill |
|---|---|---|
| `services/audit-writer` | YES — every UC's workflow calls this | `audit-writer-pattern` |
| `services/rules-service` | YES — one GoRules engine for the whole bank | (none — direct use) |
| Cloud SQL: `application_state` | YES — one row per case across UCs | (none — schema is shared) |
| Cloud SQL: `application_events` | YES — append-only audit | `audit-writer-pattern` |
| Cloud SQL: `application_artifacts` | YES — register your `artifact_type` | `validation-gate` |
| Cloud SQL: `application_documents` | YES — populated by multi-doc upload | `multi-doc-ingest` |
| GCS bucket: `${GCP_PROJECT}-application-documents` | YES (shared across UCs) | `multi-doc-ingest` |

## Layer 3 — Agent archetypes (5-agent v2 stack)

| Archetype | When to use | Skill |
|---|---|---|
| `document_processor` | Cross-doc reconciliation per UC | `agent-response-schema` |
| `analyst` | Multi-section structured analysis (was 7 specialists) | `agent-response-schema` |
| `rater_and_covenant_designer` | Risk-band + control package | `agent-response-schema` |
| `drafter` | Long-form structured prose | `agent-response-schema` |
| `reviewer` | Audit + finding categories | `agent-response-schema` |

Each archetype has a Vertex Gemini `response_schema` defined as a Python
dict literal; copy the structure and adapt the leaf shapes to your
domain's output.

## Layer 4 — Cloud Workflows v2 template

| Asset | Reusable? | Skill |
|---|---|---|
| `usecases/credit-memo-commercial/workflow.v2.yaml` | YES — copy + adapt | `workflow-design` |
| `scripts/test_workflow_dryrun.py` | YES — reference structure validator | (script-as-doc) |
| `scripts/parity_v1_v2.py` | YES — reference parity verifier | (script-as-doc) |

The v2 workflow shape is:
```
init → audit_workflow_started → extract_documents (parallel per doc)
  → validate_completeness → check_validation_decision (switch)
  → run_return_for_revision (branch)
  → stage_3_atomic_services (parallel)
  → stage_4_rules
  → call_<5 agents in sequence>
  → record_pre_approval_state
  → wait_for_approval (callback)
  → stage_7_sinks (parallel)
  → publish_decided
```

Every UC's workflow follows this skeleton; only the agents + atomic
services + rule sets differ.

## Layer 5 — UI components

| Component | Reusable? | Where |
|---|---|---|
| `DocumentExtractionPanel` | YES (all UC's case detail) | `usecases/<uc>/ui/components/document-extraction/` |
| `SpreadingDetailPanel` | YES (any financial UC) | `usecases/<uc>/ui/components/spreading/` |
| `ReturnedApplicationPanel` | YES (any UC with validation gate) | `usecases/<uc>/ui/components/returned-application/` |
| `AppShell`, `CaseRow`, `MetricStrip`, etc. | YES — shared primitives | `ui/packages/components/` |
| `AgentReasoningPanel`, `BreadcrumbNav` | YES — agent activity | `agent-activity-ui` skill |

## Layer 6 — The 7-track factory pattern

When you build a use case, you traverse these 7 tracks:

| Track | What | Skill |
|---|---|---|
| A | Document extraction (per-doc + multi-doc upload + tests) | `document-extraction-pipeline`, `multi-doc-ingest`, `production-test-suite` |
| B | Atomic services (5-ish, consolidate from the start) | `service-consolidation` |
| C | Agent layer (5 agents max with response_schema) | `agent-response-schema`, `adk-agent-design` |
| D | Cloud Workflows v2 + audit-writer | `workflow-design`, `audit-writer-pattern` |
| E | Validation gate (Python + TS parity) | `validation-gate` |
| F | UI: per-doc panel + spreading panel + returned-application panel | `agentic-ui-principles`, `process-narrative-ui` |
| G | Cutover (parity period + decommission) | (cutover runbook + parity script) |

Every track has a corresponding skill OR set of skills. Auto-loaded
based on file paths you touch.

## Hard discipline (from product-build-discipline.md)

Even when reusing every asset, the bank's 28 hard rules apply. The most
expensive ones to skip:

- Rule 2: response_schema for every structured-output agent
- Rule 3: no silent stubs (vendor failures must be loud)
- Rule 7: idempotency guard on every async handler
- Rule 13: live > polled > static
- Rule 14: defensive UI everywhere
- Rule 20: required env vars hard-fail at boot
- Rule 21: Cloud Run timeout = measured P99 + 50%

## Cost & latency targets

A new UC starting from this factory should hit:

- Per-case cost < $0.10 (Landing AI ≤ $0.50/doc, agents ≤ $0.05/call)
- p95 wall-time < 5 minutes (multi-doc parallel + agent consolidation)
- Atomic services: 4-6 (don't decompose past 5 unless org constraints
  force it)
- Agents: 4-6 (don't fan out past 5 unless eval shows separate prompts
  outperform a single response_schema by ≥10%)

These are the v2 targets credit-memo-commercial hit; subsequent UCs
should match or beat them.

## Reference

- `.claude/skills/` — every skill listed above is auto-loaded by file path
- `docs/methodology/cutover-runbook-credit-memo-v2.md` — Track G template
- `docs/methodology/product-build-discipline.md` — the 28 hard rules
- `docs/methodology/agentic-ui-principles.md` — UI 5 principles
- `docs/methodology/model-prerequisites.md` — model-provider checklist
- `services/atomic/document-extractor/tests/README.md` — test discipline
  exemplar
