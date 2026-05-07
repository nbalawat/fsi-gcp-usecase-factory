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

