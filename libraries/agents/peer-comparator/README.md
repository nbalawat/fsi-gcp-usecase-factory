# peer-comparator (agent archetype, v1.0)

A reusable, parameterized agent definition for positioning one entity against a peer cohort across a fixed metric list. This is a **contract**, not an implementation — ADK SDK wiring lives in `fsi-adk-patterns` and is performed at instantiation time.

## What it does

- Calls one upstream peer-set fetcher (parameterized via `peer_set_tool`).
- Validates currency / scale alignment across subject and peers; drops mismatched peers rather than silently converting.
- Emits per-metric `subject_percentile` AND signed `dollar_distance_to_median` — never just one.
- Justifies peer-set selection in one cited sentence; refuses generic "industry peers" rationales.
- Flags small or partially covered peer sets for human review.

The model is locked to `claude-opus-4-7` per the bank's two-model rule (see `.claude/skills/model-selection/SKILL.md`). **TODO (v1.1):** evaluate downgrading the high-volume surveillance instance to `gemini-3-1-flash` — surveillance latency / cost profile differs materially from credit-memo and M&A diligence.

## Where it fits

| Use case | `entity_type` | `peer_set_tool` | Typical `metric_set` |
|---|---|---|---|
| Commercial credit memo | `borrower` | `peer-benchmarker` | ebitda_margin, leverage, interest_coverage, revenue_growth_3y |
| Trade surveillance anomaly | `counterparty` | `surveillance-cohort-fetcher` | order_to_trade_ratio, cancel_rate, off_book_pct |
| M&A diligence | `borrower` | `ma-comp-fetcher` | ev_to_ebitda, ev_to_revenue, fcf_yield |
| Vendor risk | `vendor` | `tprm-cohort-fetcher` | concentration_pct, financial_health_index, breach_history |

## How to instantiate

Instantiation is driven by the `fsi-reasons-canvas` workflow when a use case's `reasons.yaml` declares this archetype as a step in its inner workflow. At instantiation time you must supply:

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `entity_type` | `string` | yes | `borrower` \| `customer` \| `vendor` \| `merchant` \| `counterparty` |
| `peer_set_tool` | `string` | yes | Name of the upstream peer-set fetcher MCP tool |
| `metric_set` | `list[string]` | yes | Metrics to compare on; must exist on subject and ≥ 75% of peers |
| `benchmark_method` | `enum` | yes | `median` \| `percentile` \| `weighted` |
| `peer_set_size` | `int` | no | Default `8`; below 5 valid peers → `requires_human_review: true` |
| `memory_scope` | `string` | no | Overrides `memory_scope_default` (default `entity`) |

The instantiator renders `instruction.md.j2` with these parameters, wires the named peer-set fetcher via `McpToolset.from_manifest(...)`, and constructs the `LlmAgent`. See `fsi-adk-patterns` for the current API.

## Canonical instance

The credit-memo-commercial pilot's instantiation will live at `usecases/credit-memo-commercial/agents/peer-comparator/` and serve as the canonical reference for new instances. <!-- TODO: link once credit-memo-commercial lands. -->

## Tests

`tests/golden/` holds shape-level golden cases that every instantiation must continue to pass after rendering. Instances add their own use-case-specific golden cases (per-metric percentile boundary tests) on top.

## Versioning

Bump `version` in `archetype.yaml` on any change that alters the agent's contract (peer-set output shape, currency-mismatch policy, percentile + dollar-distance dual requirement). The `used_by` list determines which use cases must re-validate.
