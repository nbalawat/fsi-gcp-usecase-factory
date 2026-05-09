---
name: agent-response-schema
description: Single-call structured-output discipline using Vertex Gemini response_schema (or Anthropic tool-use). Auto-loads when authoring an LlmAgent, when consolidating multiple specialists into one, or when an agent's output is parsed by downstream code.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Agent response_schema — the structured-output discipline

Rule 2 of `docs/methodology/product-build-discipline.md` paid for in
real incidents: **structured-output agents need response_schema.**
Prompt-only "please return JSON" rules don't hold under temperature
variance + model updates. The model invents wrapper keys, drops
required fields, renames "ebitda" to "EBITDA", reformats numbers as
strings. Every drift breaks downstream code.

## What you build

For each agent that produces JSON:
1. Define the response_schema as a Python dict literal next to the
   agent module (single source of truth)
2. Build the LlmAgent with that schema applied via Vertex's
   `GenerateContentConfig(response_schema=...)` (Gemini) or
   Anthropic's tool-use forced-tool pattern (Claude)
3. Test the schema's structural validity in CI (no live LLM call —
   shape-only)

Example from credit-memo-commercial Track C:

```python
# usecases/credit-memo-commercial/agents/analyst.py

ANALYST_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": [
        "normalization", "peer_set", "management_quality",
        "customer_concentration", "stress_scenarios", "collateral",
        "regulatory",
    ],
    "properties": {
        "management_quality": {
            "type": "OBJECT",
            "required": ["rating", "factors"],
            "properties": {
                "rating": {"type": "STRING",
                           "enum": ["strong", "adequate", "weak"]},
                "factors": {"type": "ARRAY", "items": {...}}
            }
        },
        ...
    }
}
```

## Consolidation as a forcing function

Track C consolidated 7 specialist agents (financial_spreader_agent +
peer_set_curator + management_quality_rater + customer_concentration_analyzer +
stress_scenario_modeler + collateral_appraiser + regulatory_checker)
into ONE `analyst` agent with a 7-section response_schema.

The schema does the work the 7 separate agents used to do:
- It REQUIRES every section (the `required` array prevents the model
  from skipping)
- It enums every band/rating (no "moderate-low" creative bands)
- It pins every numeric field (no "approximately $25M" strings)

~85% fewer LLM calls per case + faster end-to-end + tighter coherence
(one model wrote all 7 sections so they reference each other
correctly).

## The 4 hard gates

| Gate | Why |
|---|---|
| **Schema validates** | A CI test recursively walks the schema and asserts every node uses Vertex-acceptable types {OBJECT, ARRAY, STRING, NUMBER, INTEGER, BOOLEAN}, every property has a type, every enum is a list of strings |
| **`required` is exhaustive** | Every regulator-visible section MUST be in `required[]`. The schema is the contract; downstream code crashes loudly if a key is missing — never silently |
| **Enums constrain bands** | Risk bands, ratings, severity tiers — anything banker-readable — uses `enum`. The model cannot invent new bands |
| **Citation evidence required** | Every claim about people/governance/regulatory carries `evidence: {doc_id, page, excerpt}` (also a required field). The reviewer agent audits these → no claims without evidence |

## Real test pattern (deterministic — no LLM call)

```python
def test_seven_legacy_agents_mapped():
    mapping = {
        "financial_spreader_agent": "normalization",
        "peer_set_curator": "peer_set",
        "management_quality_rater": "management_quality",
        ...
    }
    required = ANALYST_RESPONSE_SCHEMA["required"]
    for legacy, sub_section in mapping.items():
        assert sub_section in required

def test_management_quality_carries_citation_evidence():
    mq = ANALYST_RESPONSE_SCHEMA["properties"]["management_quality"]
    factors_item = mq["properties"]["factors"]["items"]
    assert "evidence" in factors_item["properties"]
```

20 deterministic tests in
`usecases/credit-memo-commercial/tests/test_consolidated_agents.py`
verify the 4 new agent schemas + their prompts cover the legacy
capabilities (analyst → 7 specialists; rater → rater+covenant_designer;
reviewer → memo_reviewer; document_processor → classifier+extractor).

## Vertex vs Anthropic structured output

- **Vertex Gemini**: native — pass `response_schema` to
  `GenerateContentConfig`. Model can't deviate. Default for new agents
- **Anthropic Claude**: native is via tool-use with forced-tool
  selection (`tool_choice: {type: "tool", name: "..."}`). Sub-skill
  `.claude/skills/claude-api` covers the SDK; the schema you define is
  the same Python dict (Anthropic accepts JSON Schema, Vertex accepts
  its OpenAPI subset)

The skill `.claude/skills/model-selection` walks you through which
provider to pick + the prerequisites.

## What's reusable

**Reusable (use as-is — don't fork)**:
- The schema-validity test pattern
- The "consolidation forcing function" — every multi-agent fan-out
  should be questioned: can ONE agent with a sectioned response_schema
  produce this?
- The 4-gate discipline

**Per use case (you author)**:
- Your agent's response_schema (specific to your domain output)
- Your prompt's `# Output contract` section (must match the schema
  exactly; the prompt names every required key)

## Reference

- `usecases/credit-memo-commercial/agents/analyst.py` — 7-section
  consolidated schema (was 7 separate agents)
- `usecases/credit-memo-commercial/agents/rater_and_covenant_designer.py`
  — risk-band + 3-class covenant package
- `usecases/credit-memo-commercial/agents/reviewer.py` — review
  outcomes + finding categories
- `usecases/credit-memo-commercial/tests/test_consolidated_agents.py`
  — 20 deterministic tests
