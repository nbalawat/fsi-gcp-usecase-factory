# LLM fixtures for credit-memo-commercial

Pinned agent responses for deterministic local e2e testing.
Record with: pytest --record-llm usecases/credit-memo-commercial/tests/
Replay with: (default, no flag needed)

Files are named <agent_name>_<scenario_slug>.json.

## Agents covered

- **extractor** — financial statement extraction and normalisation (claude-opus-4-7)
- **rater** — risk band assignment (1-pass through 4-doubtful) (claude-opus-4-7)
- **drafter** — credit memo narrative and recommendation (claude-opus-4-7)

## Scenarios

| File prefix | Scenario |
|---|---|
| `*_happy_path_approve` | Full approval path, DSCR 3.82, risk band 1-pass |
| `*_rated_substandard_decline` | DSCR breach at inception, risk band 3-substandard, DECLINE |
| `*_exposure_limit_decline` | Exposure limit breach 8.65% vs 8.0%, DECLINE despite 1-pass credit |
| `*_covenant_projection_violation` | Seasonal Q3 DSCR trough breach, RETURN_FOR_REVISION |
| `*_regulatory_clock_breach` | Extractor timeout, pipeline stall, P1 alarm at T+5 business days |

## Fixture schema

Each file contains:
- `_fixture_meta` — agent name, scenario, input_hash, model, recorded_at
- `output_key` — the workflow output key this stub satisfies
- `output_value` — the pinned mock response (shape-correct, values plausible)

## Notes

- Stubs are intentionally shape-correct but not byte-for-byte real model output.
- The `citation_density` field must be >= 0.8 in all approval/decline/return stubs.
- `word_count` in drafter stubs must be <= 1500 per SLO.
- The regulatory-clock-breach scenario extractor stub simulates a failure response,
  not a successful extraction.
