---
name: model-selection
description: Decision guide for picking the right model for an agent. Auto-invoked when ADK agents are being authored or model parameters are being set. Only two models are approved for production; this skill explains which to use when and how to handle exceptions.
---

# Model selection

The bank uses exactly two foundation models in production. Picking the right one for each agent role is part of the architecture.

## The two approved models

### `claude-opus-4-7`
For: long-form reasoning, document IQ, narrative generation, multi-step decisioning, edge cases.

Use when:
- The agent reads documents (forms, contracts, evidence)
- The agent must produce written output (memos, narratives, explanations)
- The decision involves nuanced reasoning across multiple inputs
- The use case can tolerate seconds-of-latency
- The cost per invocation is acceptable (typically $0.05–$2.00 depending on token count)

Examples in the platform:
- Document extractor (mortgage, commercial loan)
- Underwriter memo drafter
- SAR narrative drafter
- Eligibility checker (when reasoning is needed)
- Supervisor agents (orchestration with judgment)
- Complaint analyzer

### `gemini-3-1-flash`
For: real-time scoring, high-volume classification, sub-second decisions.

Use when:
- The agent must respond in <500ms
- Volume is high (>100 invocations/sec sustained)
- Cost per invocation must be <$0.005
- The decision is well-defined classification (not nuanced reasoning)

Examples in the platform:
- Gray-zone fraud scorer (after rules)
- Document classifier (precedes extractor)
- Real-time payment risk scorer
- ATO/login risk scorer
- High-volume complaint categorizer

## The decision tree

Walk through these questions to pick:

1. **Does the agent run in <1s budget?** Yes → Gemini Flash. No → continue.
2. **Volume >50/sec sustained?** Yes → Gemini Flash. No → continue.
3. **Reading documents or producing prose?** Yes → Claude Opus.
4. **Multi-step reasoning across heterogeneous inputs?** Yes → Claude Opus.
5. **Default for ambiguous cases:** Claude Opus.

## Multi-model agents

In supervisor patterns, mix freely:

```python
classifier = LlmAgent(model=Gemini("gemini-3-1-flash"), ...)  # fast filter
extractor = LlmAgent(model=Claude("claude-opus-4-7"), ...)    # deep parsing
eligibility = LlmAgent(model=Claude("claude-opus-4-7"), ...)  # nuanced reasoning
memo = LlmAgent(model=Claude("claude-opus-4-7"), ...)         # narrative generation
```

This is the canonical mortgage / underwriting pattern. Cheap classifier filters; deep models do the work that needs them.

## Fallbacks

Every agent has a fallback model declared:

```python
agent = LlmAgent(
    name="...",
    model=Claude("claude-opus-4-7"),
    fallback_model=Claude("claude-haiku-4-5"),  # if primary times out
)
```

Fallback is not a third "production" model — it's a degraded-but-functional path. Acceptable fallbacks:
- Claude Opus → Claude Haiku (simpler reasoning, faster)
- Claude Opus → Gemini Flash (different vendor, regional outage)
- Gemini Flash → Claude Haiku (different vendor)

## Exceptions

If a use case genuinely needs a different model, the requesting team must:

1. Open architecture review at internal-git.bank.example.com/platform/discussions
2. Document why the two approved models are insufficient
3. Get sign-off from platform team and security
4. Add an `EXCEPTION:` comment in code citing the approval
5. Update the use case's `compliance_pack/model_card.md`

Common exception requests and the bank's positions:
- "We need a smaller, cheaper model" — try Claude Haiku 4.5 as fallback first
- "We need a more capable model" — Claude Opus 4.7 is the most capable approved
- "We need a domain-specialized model" — usually solved by better prompts + better tools, not a different model
- "Vendor X has a feature we need" — open architecture review

## Cost monitoring

Every agent must declare a cost-per-decision budget in `slos.yaml`:

```yaml
agent:
  cost_per_decision_usd_max: 0.50
  tokens_per_decision_max: 30000
```

The synthetic load run verifies actuals are below budget. The canary monitor watches in production. Drift triggers alerts.

## Sizing rules of thumb

For initial budgets:
- Gemini Flash: ~$0.001-$0.005 per decision, ~5K tokens
- Claude Opus 4.7: ~$0.05-$0.50 per decision, ~10K-50K tokens
- Claude Opus on document IQ: ~$0.50-$2.00, ~50K-200K tokens

Refine based on actual measurements after first synthetic load run.

## Anti-patterns to refuse

- Calling unapproved models without exception
- Hardcoding model names instead of using the approved model registry
- Skipping fallback declaration
- Ignoring cost budget
- Using Claude Opus for sub-second high-volume work (it won't make budget)
- Using Gemini Flash for nuanced reasoning (quality regression)
