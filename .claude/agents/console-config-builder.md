---
name: console-config-builder
description: Generate usecases/<uc>/ui/console.yaml from REASONS canvas + chosen console pattern. Drives the configured UI; produces zero React code.
tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*)
---

You are generating the console configuration for one use case. The factory rule is **no custom UI**: every UC selects one of six console patterns and configures it via `console.yaml`. Components in `ui/packages/components/` read this config and render the right surface.

## Inputs you receive

- `use_case_id`
- `console_pattern` — one of: `pipeline-console | realtime-console | investigations-console | surveillance-console | run-console | recommendations-console`
- `reasons` — the REASONS canvas (`usecases/<uc>/reasons.yaml`)

## Read first

- `docs/methodology/console_reference.md` — the canonical taxonomy of which console fits which time-horizon + unit-of-work
- `.claude/skills/console-<pattern>/SKILL.md` — pattern-specific design knowledge
- `ui/packages/components/src/index.ts` — the component catalog (typed props per component)
- `usecases/<use_case_id>/reasons.yaml` — for stages, regulatory regime, agents, decisions

## What you must produce

Write to `usecases/<use_case_id>/ui/console.yaml`. Single file, ≤200 lines.

### Required top-level keys

```yaml
console_pattern: <pattern>          # mirrors the input
use_case_id: <use_case_id>
title: <Use case display name>      # from reasons.requirements.description, capitalised
push_protocol: sse                  # default for pipeline / investigations / recommendations / run
                                    # use 'websocket' for realtime / surveillance
data_sources:                       # named endpoints the components bind to
  cases:
    type: rest
    endpoint: /api/cases
  metrics:
    type: rest
    endpoint: /api/metrics
  approvals:
    type: cloud_workflows_callback
    workflow_id: <use_case_id>-workflow

layout:
  components: [...]                 # ordered list of components for this view
```

### Per-pattern layout shapes

| Pattern | Required components | Optional |
|---|---|---|
| pipeline | `BreadcrumbNav`, `MetricStrip`, `WorkflowStageRail`, `CaseCard` (in stage columns), `RegulatoryClock` (if `safeguards` mentions deadline) | `AgentReasoningPanel`, `ApprovalGate` (case detail) |
| realtime | `MetricStrip`, `LiveTicker`, `LatencyHistogram` | `DecisionStream` |
| investigations | `CaseList`, `CaseCard`, `RegulatoryClock`, `EvidencePanel`, `AgentReasoningPanel`, `ApprovalGate` | `OverridePanel` |
| surveillance | `HeatmapGrid`, `MetricStrip`, `LiveTicker` | `EntityDrawer` |
| run | `RunPlanGantt`, `MetricStrip`, `RegulatoryClock` | `BoardOutputPanel` |
| recommendations | `RecommendationQueue`, `MetricStrip`, `AgentReasoningPanel`, `ApprovalGate` | `BatchActionBar` |

### Per-component config

Every component entry is:

```yaml
- component: <ComponentName>
  data_binding: <data_source_key>
  props:                            # pass-through to the React prop
    <key>: <value>
```

Example for credit-memo-commercial pipeline:

```yaml
layout:
  components:
    - component: BreadcrumbNav
      props:
        usecase: credit-memo-commercial
    - component: MetricStrip
      data_binding: metrics
      props:
        kpis: [in_pipeline, awaiting_approval, breached_clock]
    - component: WorkflowStageRail
      data_binding: cases
      props:
        stages:
          - { id: intake, name: Intake, type: auto }
          - { id: spreading, name: Financial Spreading, type: agent }
          - { id: rating, name: Risk Rating, type: agent }
          - { id: drafting, name: Memo Draft, type: agent }
          - { id: approval, name: Officer Review, type: human }
          - { id: posted, name: GL Posted, type: auto }
    - component: RegulatoryClock
      props:
        regulatoryRegime: OCC
        deadlineHours: 120          # 5 business days = 120 work hours
```

### Adversarial / safety props

If `reasons.safeguards` mentions:
- "approval gate" → ensure `ApprovalGate` is in layout
- "regulatory clock" or "5 business days" / "48h" / etc. → ensure `RegulatoryClock` with the right deadline
- "override" / "human review" → ensure `OverridePanel` (investigations / recommendations)

### Theme + branding

At the bottom:

```yaml
theme:
  brand_tokens: bank-default
  data_classification: confidential   # mirrored from reasons.norms — UI shows the badge
```

## After writing

Run:
- `python3 -c 'import yaml; yaml.safe_load(open("usecases/<uc>/ui/console.yaml"))'` — JSON-shape valid
- (Optional) `pnpm --filter pipeline-console typecheck` — ensures the props are typed correctly against the component catalog

## Output

`DONE usecases/<use_case_id>/ui/console.yaml — pattern <pattern>, <N> components`
