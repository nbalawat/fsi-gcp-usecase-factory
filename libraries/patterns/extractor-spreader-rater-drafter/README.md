# extractor-spreader-rater-drafter (multi-agent pattern, v1.0)

A supervisor + 3-specialist composition: `document-extractor` → atomic spreader services → `risk-rater` → `narrative-drafter` → supervisor synthesis. This is a **contract**, not an implementation — ADK SDK wiring lives in `fsi-adk-patterns` and is performed at instantiation time.

## When to use

- The use case ingests a document, derives structured spreads / metrics, scores the case under a rubric, and produces a long-form memo with citations.
- The output is a single bundled artifact (memo + structured rating + extracted data) consumed by a downstream approval queue or sink.
- Citation traceability matters more than throughput.

Canonical fit: commercial credit memos, SAR narratives backed by a typology rater, complex dispute resolutions backed by a Reg-E rater, vendor-risk assessments.

## When NOT to use

- **Pure extraction.** No rating, no narrative → use `document-extractor` alone.
- **Pure rating.** No narrative artifact, just a band → use `risk-rater` alone (e.g., real-time fraud scoring).
- **Conversational use cases.** Customer dialog, multi-turn intake → this pattern is one-shot; use a different pattern.
- **Sub-second latency budgets.** The rater + drafter chain alone is multi-second on Opus; not appropriate for high-volume surveillance fan-out.

## Parameterization

The pattern itself takes only supervisor-level parameters. Archetype parameters flow through to each role from the use case's `reasons.yaml: structure.agent_archetypes` block.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `output_schema` | `string` | yes | Pydantic schema for the bundled output (e.g., `CreditMemoBundle`) |
| `citation_density_min` | `float` | yes | Threshold below which the supervisor loops the drafter. Must equal the drafter's own `citation_density_min` |
| `loop_back_max` | `int` | yes | Maximum drafter loopbacks before the supervisor surrenders and sets `requires_human_review: true`. Recommended `1`; never above `2` |
| `spreader_service_ids` | `list[string]` | yes | Atomic services the supervisor invokes after the extractor and before the rater. Must be a superset of the rater's `tools` parameter (excluding rule services) |

## Supervisor prompt skeleton

The supervisor prompt is rendered from `supervisor-instruction.md.j2`. At a high level:

1. Receive trigger event payload.
2. Invoke `extractor` once with the document URI.
3. Fan out the `spreader_service_ids` (parallel where independent) and join their outputs into the working bundle.
4. Invoke `rater` once. The rater itself may call rule services from its own `tools` list.
5. Invoke `drafter` once with the full bundle (extracted + spreads + rater output).
6. If `drafter.citation_density < citation_density_min` and loopback count < `loop_back_max`, invoke the drafter again with `mode: "patch_citations"`. Otherwise, set `requires_human_review: true`.
7. Assemble final bundle conforming to `output_schema` and return.

The supervisor never re-invokes the extractor or rater on a citation-density loopback — only the drafter loops.

## Bundled output shape

Instances bind `output_schema` to a concrete Pydantic schema. The pattern guarantees the bundle carries:

- `extraction` — the extractor's output (structured fields + page citations).
- `rating` — the rater's output (band + factors + confidence).
- `narrative` — the drafter's output (memo_text + citations + word_count + density).
- `supervisor` — `{ loopback_count, latencies_ms, requires_human_review, warnings }`.

Example: the credit-memo-commercial pilot's `output_schema` is `CreditMemoBundle`.

## Canonical instance

The credit-memo-commercial pilot is the canonical reference. <!-- TODO: link once credit-memo-commercial lands. -->

## Tests

`tests/golden/` holds an end-to-end happy-path trace asserting the specialist invocation sequence and the final bundle shape. Instances add their own use-case-specific golden traces (loopback paths, evidence-gap paths, refusal paths) on top.

## Versioning

Bump `version` in `pattern.yaml` on any change that alters the data flow, the loopback contract, or the bundled output structure. The `used_by` list determines which use cases must re-validate.
