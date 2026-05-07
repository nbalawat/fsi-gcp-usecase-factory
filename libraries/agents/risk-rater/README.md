# risk-rater (agent archetype, v1.0)

A reusable, parameterized agent definition for scoring a case against a domain rubric and returning a banded score plus a factor-level evidence trail. This is a **contract**, not an implementation — ADK SDK wiring lives in `fsi-adk-patterns` and is performed at instantiation time.

## What it does

- Receives a case bundle conforming to a use-case `input_schema`.
- Calls the rubric-designated tools to gather evidence on each factor.
- Emits a single band drawn from the allowed `bands` list, with per-factor citations to the originating tool.
- Calibrates confidence and flags low-confidence or evidence-gap cases for human review.

The model is locked to `claude-opus-4-7` per the bank's two-model rule (see `.claude/skills/model-selection/SKILL.md`). Banded judgement under uncertainty is a canonical Opus workload.

## Where it fits

| Use case | Example rubric | Example bands |
|---|---|---|
| Commercial credit memo | `commercial-credit-rubric-v1` | 1-pass / 2-special-mention / 3-substandard / 4-doubtful / 5-loss |
| AML alert review | `aml-case-rubric-v2` | low / medium / high / refer-SAR |
| Vendor risk | `tprm-rubric-v1` | tier-1 / tier-2 / tier-3 / tier-4 |
| Fraud case rating | `fraud-case-rubric-v1` | benign / suspicious / confirmed |

## How to instantiate

Instantiation is driven by the `fsi-reasons-canvas` workflow when a use case's `reasons.yaml` declares this archetype as a step in its inner workflow. At instantiation time you must supply:

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `rubric` | `string` | yes | Reference to a registered rubric (factors, weights, banding thresholds) |
| `bands` | `list[string]` | yes | Ordered, lowest-risk first; agent must return exactly one |
| `input_schema` | `string` | yes | Pydantic schema for the inbound case bundle |
| `tools` | `list[string]` | yes | MCP tools / atomic services the rater may call for evidence |
| `confidence_floor` | `float` | no | Default `0.6`; below this, `requires_human_review` is forced true |
| `memory_scope` | `string` | no | Overrides `memory_scope_default`; pick the narrowest scope that supports the use case |

The instantiator renders `instruction.md.j2` with these parameters, wires the named tools via `McpToolset.from_manifest(...)`, and constructs the `LlmAgent`. See `fsi-adk-patterns` for the current API.

## Canonical instance

The credit-memo-commercial pilot's instantiation will live at `usecases/credit-memo-commercial/agents/risk-rater/` and serve as the canonical reference for new instances. <!-- TODO: link once credit-memo-commercial lands. -->

## Tests

`tests/golden/` holds shape-level golden cases that every instantiation must continue to pass after rendering. Instances add their own use-case-specific golden cases (per-rubric threshold tests) on top.

## Versioning

Bump `version` in `archetype.yaml` on any change that alters the agent's contract (band semantics, factor-citation requirement, confidence calibration rules). The `used_by` list determines which use cases must re-validate.
