# narrative-drafter (agent archetype, v1.0)

A reusable, parameterized agent definition for composing long-form memos and reports from structured upstream inputs. This is a **contract**, not an implementation — ADK SDK wiring lives in `fsi-adk-patterns` and is performed at instantiation time.

## What it does

- Consumes the rendered upstream state bundle (extracted fields + atomic-service outputs + rater band) — does NOT call MCP tools itself.
- Renders prose conforming to a named `output_format` template (sections, order, length budgets).
- Cites every factual claim back to an upstream agent / tool output.
- Enforces a hard `max_words` cap by redacting the lowest-priority section (`[REDACTED FOR LENGTH]`) — never silent truncation.
- Computes a `citation_density` and flags low-density drafts for human review or supervisor loopback.

The model is locked to `claude-opus-4-7` per the bank's two-model rule (see `.claude/skills/model-selection/SKILL.md`). Long-form regulatory prose with citation discipline is a canonical Opus workload.

## Where it fits

| Use case | `output_format` | `tone` | Typical `max_words` |
|---|---|---|---|
| Commercial credit memo | `credit-memo-occ-v1` | `regulatory-formal` | 1500 |
| AML SAR narrative | `sar-narrative-fincen-v1` | `regulatory-formal` | 1000 |
| Reg-E dispute letter | `dispute-letter-reg-e-v1` | `customer-empathetic` | 400 |
| CFPB complaint resolution | `complaint-resolution-cfpb-v1` | `customer-empathetic` | 600 |

## How to instantiate

Instantiation is driven by the `fsi-reasons-canvas` workflow when a use case's `reasons.yaml` declares this archetype as a step in its inner workflow. At instantiation time you must supply:

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `output_format` | `string` | yes | Reference to a registered prose template |
| `max_words` | `int` | yes | Hard cap; over-cap → `[REDACTED FOR LENGTH]`, never silent truncation |
| `citation_density_min` | `float` | yes | In `[0, 1]`; below → `requires_human_review: true` |
| `tone` | `enum` | yes | `regulatory-formal` \| `customer-empathetic` \| `internal-technical` |
| `memory_scope` | `string` | no | Overrides `memory_scope_default` (default `case`); credit memo overrides to `borrower` |

The instantiator renders `instruction.md.j2` with these parameters and constructs the `LlmAgent`. No tools are wired — the drafter consumes upstream agent outputs via SequentialAgent state. See `fsi-adk-patterns` for the current API.

## Canonical instance

The credit-memo-commercial pilot's instantiation will live at `usecases/credit-memo-commercial/agents/narrative-drafter/` and serve as the canonical reference for new instances. <!-- TODO: link once credit-memo-commercial lands. -->

## Tests

`tests/golden/` holds shape-level golden cases that every instantiation must continue to pass after rendering. Instances add their own use-case-specific golden cases (per-template section assertions) on top.

## Versioning

Bump `version` in `archetype.yaml` on any change that alters the agent's contract (citation requirement, redaction policy, tone enum). The `used_by` list determines which use cases must re-validate.
