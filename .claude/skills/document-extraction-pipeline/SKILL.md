---
name: document-extraction-pipeline
description: Add per-document extraction with citations to any use case. Auto-loads when authoring a service, agent, or workflow that processes uploaded PDFs (10-K, audited financials, appraisals, KYC docs, claim forms, court records). Codifies the production-grade Landing AI ADE pattern from credit-memo-commercial Track A.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*)
---

# Document extraction pipeline — the factory pattern

Use this when your use case needs to extract structured data from PDFs.
This is the pattern shipped with credit-memo-commercial; it scales to
any document-heavy use case (mortgage origination, commercial-claim
intake, court-record ingestion, KYC, fraud-doc review).

## What you build

Three layers that together produce typed, cited extraction with loud
failure paths:

```
1. schemas/document_requirements.json     # what doc_types your UC accepts
2. schemas/extractions/<doc_type>.json    # one JSON Schema per doc_type
3. services/atomic/document-extractor/    # vendor-pluggable Cloud Run
```

The atomic service already exists at
`services/atomic/document-extractor/` — your use case reuses it, you
don't fork it. You only author the schemas + the requirement matrix
specific to your domain.

## When to invoke

If you're authoring any of these:
- a Cloud Run service that takes a `gcs_uri` to a PDF as input
- an agent that needs to read a PDF
- a workflow YAML that fans out per-document
- a UI panel that shows what was extracted from each doc

…this skill should auto-load and surface the pattern.

## The 4 hard gates (non-negotiable)

| Gate | Why | Where it lives |
|---|---|---|
| **Per-doc-type extraction schema** | The contract between extraction and every downstream consumer. Schema-driven (`response_schema`) extraction beats prompt-only — it cannot drop required fields. | `usecases/<uc>/schemas/extractions/<doc_type>.json` |
| **`required_fields` + `preferred_fields` per doc_type** | Drives missing-field detection, which drives the validation gate (return-for-revision flow). | `usecases/<uc>/schemas/document_requirements.json` |
| **Vendor abstraction** | Landing AI ADE is the default; LiteParse + Vertex Gemini is the documented fallback. Every vendor implementation lives behind the same `VendorResult` shape. | `services/atomic/document-extractor/vendors/` |
| **Citation chain** | Every extracted leaf carries `{field_path, chunk_id, page (1-indexed), bbox, excerpt}` so the UI can draw bbox overlays + the audit trail can justify each value. | `VendorCitation` dataclass |

## Production-test discipline (10 quality gates)

Every doc-extraction component ships with all 10 BEFORE its first deploy.
See `.claude/skills/production-test-suite/` for the full gate list.

The 4 most-paid-for-by-incidents from credit-memo-commercial:
- **Real-PDF golden fixtures** (Berkshire 2023, smoke 10pp, deficient
  chairman letter, truncated corrupt) — JSON fixtures masquerading as
  real tests is the most expensive shortcut you can take
- **Cost ceiling assertion** — Landing AI's per-doc cost can spike
  silently when their model changes; the test catches the regression
- **0-indexed page conversion** — Landing AI returns 0-indexed pages;
  every other system is 1-indexed. Without a test, this drifts
- **Structural-walker citation extraction** — ADE Extract emits
  `{references: [chunk_uuids], value: ...}` shapes; not the obvious
  `chunk_reference: id` shape from older docs. Always probe the actual
  response before writing the walker

## How to add doc extraction to a new use case

1. Define your doc_types in
   `usecases/<uc>/schemas/document_requirements.json` with required +
   preferred fields per doc_type.
2. Author one `usecases/<uc>/schemas/extractions/<doc_type>.json` per
   doc_type using draft-07 JSON Schema with all leaves typed
   `["number", "null"]` or `["string", "null"]`.
3. Wire your workflow's Stage 1 to call
   `services/atomic/document-extractor` with `application_id, doc_id,
   doc_type, gcs_uri` per uploaded PDF (parallel branches).
4. Add real-PDF fixtures + cost+latency budgets to your use case's
   tests/ directory.
5. The validation gate (`.claude/skills/validation-gate/`) consumes
   the extractor's output to decide GO vs RETURN_FOR_REVISION.

## What's reusable vs what's per-use-case

**Reusable (use as-is — don't fork)**:
- `services/atomic/document-extractor/` — the Cloud Run service, vendor
  abstraction, audit module, Pydantic boundary
- `vendors/landing_ai.py` — Landing AI ADE Parse + Extract integration
- `vendors/liteparse_gemini.py` — fallback path

**Per use case (you author)**:
- `usecases/<uc>/schemas/document_requirements.json`
- `usecases/<uc>/schemas/extractions/<doc_type>.json`
- The cost/latency budgets in your service manifest
- Real-PDF golden fixtures specific to your domain

## Reference docs

- `services/atomic/document-extractor/tests/README.md` — how to run the
  10-gate test suite
- `services/atomic/document-extractor/manifest.json` — measurements
  block records the live cost/latency for regression detection
- `docs/methodology/cutover-runbook-credit-memo-v2.md` — how the
  extractor wires into a Cloud Workflows v2 path
