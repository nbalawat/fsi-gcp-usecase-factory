---
name: fsi-reasons-canvas
description: Author or update a use case's reasons.yaml → 7 sections (R/E/A/S/O/N/S) → validates against policies/reasons_schema.json → enforces prompt-first behavior changes.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(jsonschema:*, yq:*, python:*, git:*)
---

# fsi-reasons-canvas — REASONS as the use-case contract

REASONS is the structured spec every use case must produce. Adopted from Martin Fowler's [Structured Prompt-Driven Development](https://martinfowler.com/articles/structured-prompt-driven/). When REASONS is the source of truth, code generation is mechanical and intent drift is detectable.

The schema lives at [policies/reasons_schema.json](../../../policies/reasons_schema.json). This skill is the authoring workflow.

## When to invoke

| Situation | Path |
|---|---|
| New use case | `/fsi-reasons-canvas` (called by `/init-use-case` automatically) → produces a draft REASONS canvas from diagnostic answers |
| Behavior change to existing use case | `/fsi-prompt-update <usecase>` → edit REASONS → regenerate affected operations |
| Pure refactor that already happened in code | `/fsi-sync <usecase>` → re-derive Structure section from current code, propose REASONS updates |
| Review only | `/fsi-reasons-review <usecase>` → focused intent-alignment review (R/E/A/S level), not implementation review |

## The seven sections (in order)

Every `usecases/<name>/reasons.yaml` has these sections. Empty sections fail schema validation.

### R — Requirements

Problem statement and definition of done.

```yaml
requirements:
  summary: "Generate a commercial credit memo for a new or renewing C&I loan, including financial spreading, peer benchmarking, and a recommended decision with a narrative justification."
  trigger_event: "loans.application.submitted"
  outcome: "Approved memo + GL posting + document store record, within 48 hours of application"
  primary_user: "Credit officer reviewing memo in approval queue"
  regulatory_regime: ["OCC", "Reg O", "CECL"]
  latency_budget: "hours"
```

### E — Entities

Domain model and relationships. Concrete, named, scoped to this use case.

```yaml
entities:
  primary:
    - {name: "Borrower", description: "The legal entity applying for credit"}
    - {name: "Loan", description: "The proposed credit facility"}
    - {name: "FinancialStatement", description: "10-K, 10-Q, or audited financials"}
    - {name: "PeerSet", description: "Industry peers used for benchmarking"}
    - {name: "CreditOfficer", description: "Human reviewer who approves/declines"}
  relationships:
    - {from: "Loan", to: "Borrower", kind: "belongs-to"}
    - {from: "Loan", to: "FinancialStatement", kind: "references"}
    - {from: "Borrower", to: "PeerSet", kind: "references"}
```

### A — Approach

Solution strategy. Pick a use-case archetype + multi-agent pattern from the libraries; declare trade-offs explicitly.

```yaml
approach:
  use_case_archetype: "pipeline-originator@1.2"
  multi_agent_pattern: "extractor-spreader-rater-drafter@1.1"
  trade_offs:
    - "Verbosity over speed for memo prose — credit officers value reading depth"
    - "Citations over inferred narratives — every claim links back to an atomic-service output"
    - "Approval-gate latency over auto-approval — regulatory expectation"
```

### S — Structure

Components and dependencies. **Every library reference is version-pinned.** Architecture-auditor verifies each one resolves.

```yaml
structure:
  console_pattern: "pipeline-console"
  agent_archetypes:
    - role: "extractor"
      archetype: "document-extractor@2.0"
      params: {document_types: ["10-K", "10-Q", "board_minutes"]}
    - role: "rater"
      archetype: "risk-rater@1.3"
      params: {rubric: "commercial-credit-rubric"}
    - role: "drafter"
      archetype: "narrative-drafter@1.5"
      params: {output_format: "credit-memo", max_words: 1500}
  atomic_services_reused:
    - "dscr-calculator@2.1"
    - "financial-spreader@1.4"
    - "peer-benchmarker@1.0"
    - "ofac-screen@3.2"
  atomic_services_new:
    - "covenant-analyzer"
    - "industry-risk-scorer"
    - "collateral-valuator"
    - "exposure-aggregator"
  rules:
    - "regulatory_thresholds@2024-q4"
    - "single_borrower_exposure@1.1"
    - "approval_matrix_commercial@1.0"
  workflow_fragments:
    - "fan-out-join@1.0"
    - "approval-gate@1.2"
    - "agent-call-with-retry@1.0"
    - "sink-fanout@1.0"
    - "regulatory-clock@1.1"
    - "dlq-on-failure@1.0"
  sinks: ["credit-officer-queue", "document-store-gcs", "gl-posting"]
```

### O — Operations

The buildable artifacts, one entry per builder agent invocation. **`layer` drives `/fsi-build-parallel` fan-out.** Each `path` must be unique.

```yaml
operations:
  - id: "handler"
    kind: "handler"
    layer: 1
    path: "usecases/credit-memo-commercial/handler/main.py"
    spec: {trigger: "loans.application.submitted"}
  - id: "svc-covenant-analyzer"
    kind: "atomic-service"
    layer: 1
    path: "services/atomic/covenant-analyzer/"
    spec: {inputs: ["loan_terms", "covenant_set"], outputs: ["compliance_status", "violations"]}
  # ... more layer-1 services and rules
  - id: "agent-extractor"
    kind: "agent-specialist"
    layer: 2
    path: "usecases/credit-memo-commercial/agents/extractor.py"
    spec: {archetype: "document-extractor@2.0"}
    depends_on: ["svc-covenant-analyzer", "..."]
  # ... more layer-2 specialists, supervisor
  - id: "workflow"
    kind: "workflow"
    layer: 3
    path: "usecases/credit-memo-commercial/workflow.yaml"
    spec: {fragments: ["fan-out-join@1.0", "approval-gate@1.2", "..."]}
    depends_on: ["agent-supervisor"]
```

### N — Norms

Cross-cutting standards. Inherited norms reference [CLAUDE.md](../../../CLAUDE.md) section headings; use-case-specific norms add to (never override) inherited.

```yaml
norms:
  inherited:
    - "## The 5-step paradigm"
    - "## Approved models (only these in production)"
    - "## Forbidden patterns"
  use_case_specific:
    - "Memo prose ≤ 1500 words"
    - "Every claim in the memo cites at least one atomic-service output"
```

### S — Safeguards

Non-negotiable invariants. Mechanically enforced where possible.

```yaml
safeguards:
  slo:
    latency_p99_ms: 18000000  # 5 hours from event to memo
    error_rate_max: 0.005
  cost:
    per_invocation_max_usd: 3.00
    monthly_max_usd: 9000.00
  regulatory_clock:
    deadline: "Approval decision within 5 business days"
    regulator: "OCC"
  security:
    - "No PII in agent prompts; redact via redacting-logger before any model call"
    - "Borrower financials encrypted at rest with CMEK"
    - "Memory Bank scope is borrower_id; no cross-borrower leakage"
```

## Authoring workflow

When `/init-use-case` calls this skill:

1. **Load** answers from the diagnostic interview (already collected by `/new-use-case`).
2. **Inventory** library matches: search `libraries/use-cases/`, `libraries/patterns/`, `libraries/agents/`, `libraries/workflows/`, `services/atomic/`, `rules/`. Surface matches with versions.
3. **Draft** the seven sections in order. R and E come from diagnostic answers. A is the library selection. S is the wiring. O is the build manifest derived from S. N is inherited + use-case additions. Safeguards are stated SLO + cost + regulatory + security rules.
4. **Validate** against `policies/reasons_schema.json`:
   ```bash
   python -c "import json,jsonschema,yaml; jsonschema.validate(yaml.safe_load(open('usecases/<name>/reasons.yaml')), json.load(open('policies/reasons_schema.json')))"
   ```
5. **Verify references resolve**: every `archetype`, `pattern`, `service`, `rule`, `fragment` reference points to a real, version-pinned library entry.
6. **Hand to** `/fsi-build-parallel <usecase>` which reads Operations and fans out builders.

## The two-path correction protocol (hard rule)

Any commit that changes runtime behavior MUST update `reasons.yaml` in the same PR.

| Change type | Path | Mechanism |
|---|---|---|
| **Behavior change** (threshold, tool, sink, model, prompt edit) | Prompt-first | `/fsi-prompt-update` → edit REASONS → regenerate only affected Operations |
| **Pure refactor** (rename, extract, restructure, no behavior change) | Code-first then sync | edit code → `/fsi-sync` → diff REASONS Structure against current code → human approves update |

`architecture-auditor` subagent detects drift and blocks commits where REASONS and code diverge without a corresponding REASONS edit.

## Anti-patterns to refuse

- A `reasons.yaml` with empty sections — fails schema, blocks scaffold
- Library references without versions — must be `name@major.minor`
- `atomic_services_new` entries that already exist in `services/atomic/` — should be in `atomic_services_reused`
- Operations entries with overlapping `path` values — parallel build will conflict
- Norms `use_case_specific` that *override* inherited norms — only additions allowed

## Compliance pack export

`/compliance-pack <usecase>` reads `reasons.yaml` and exports the SR 11-7 model card mechanically:

| Card section | REASONS source |
|---|---|
| Statement of model purpose | requirements.summary + outcome |
| Conceptual soundness / methodology | approach |
| Implementation overview | structure + operations |
| Boundary conditions | safeguards |
| Governance and monitoring | norms + safeguards.slo |

No second-source documentation. The model card is REASONS in regulator format.
