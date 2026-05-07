# document-extractor (agent archetype, v1.0)

A reusable, parameterized agent definition for extracting structured fields from uploaded documents (PDFs, form images) into a target Pydantic schema. This is a **contract**, not an implementation — ADK SDK wiring lives in `fsi-adk-patterns` and is performed at instantiation time.

## What it does

- Receives a single document URI plus a declared `document_type`.
- Calls the `document-ai` MCP tool exactly once.
- Emits JSON conforming to the instance's `target_schema`, with page + bbox citations and per-field confidence.
- Refuses out-of-class inputs. Emits `null` rather than guessing missing fields. Flags low-confidence extractions for human review.

The model is locked to `claude-opus-4-7` per the bank's two-model rule (see `.claude/skills/model-selection/SKILL.md`). Document IQ is the canonical Opus workload.

## How to instantiate

Instantiation is driven by the `fsi-reasons-canvas` workflow when a use case's `reasons.yaml` declares this archetype as a step in its inner workflow. Follow that skill for the end-to-end flow. At instantiation time you must supply:

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `document_types` | `list[string]` | yes | E.g., `["10-K", "10-Q", "audited-financials", "board-minutes"]` |
| `target_schema` | `string` | yes | Name of a Pydantic schema registered under the use case's `schemas/` directory |
| `language` | `string` | no | ISO 639-1, default `en` |
| `memory_scope` | `string` | no | Overrides `memory_scope_default` from `archetype.yaml`; pick the narrowest scope that supports the use case |

The instantiator renders `instruction.md.j2` with these parameters, wires Document AI via `McpToolset.from_manifest(...)`, attaches the resolved Pydantic schema as the `output_schema`, and constructs the `LlmAgent`. See `fsi-adk-patterns` for the current API.

## Canonical instance

Once the credit-memo pilot is built, its instantiation will live at `usecases/credit-memo/agents/document-extractor/` and serve as the canonical reference for new instances. <!-- TODO: link once credit-memo lands. -->

## Tests

`tests/golden/` holds shape-level golden cases that every instantiation must continue to pass after rendering. Instances add their own use-case-specific golden cases on top.

## Versioning

Bump `version` in `archetype.yaml` on any change that alters the agent's contract (output shape, refusal behavior, citation requirements). The `used_by` list determines which use cases must re-validate.
