---
name: model-selection
description: Decision guide for picking the right model AND provider (Vertex Gemini ADC vs Anthropic API) for an agent, plus the hard prerequisites — auth, region, IAM, network, SDK, structured-output mechanism — that MUST be verified BEFORE scaffolding. Auto-invoked when ADK agents are being authored, model parameters are being set, or `discipline_gates.model_provider` is being declared. Skipping these prerequisites produces the "I thought we were using ADK" pivot paid for on credit-memo-commercial.
---

# Model selection

The bank uses exactly two foundation models in production. Picking the
right model AND provider for each agent role is part of the
architecture — and each provider brings hard prerequisites that must
be verified before scaffolding. Skipping the provider check produces
the half-day pivot we paid for on credit-memo-commercial.

**Two-step decision** (do them in order):

1. **Pick the model** — `claude-opus-4-7` or `gemini-3-1-flash` (the only
   two approved). Use the decision tree below.
2. **Pick the provider** — Vertex Gemini ADC, Anthropic API, or hybrid.
   Verify ALL prerequisites in
   `docs/methodology/model-prerequisites.md` BEFORE writing code. If
   any prerequisite is missing, escalate — don't paper over it.

The result lands in `usecases/<uc>/reasons.yaml#discipline_gates.model_provider`
and the orchestrator's call site MUST match. CI gate
`scripts/lint_agent_calls.py` verifies the SDK matches the declaration.

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
- **Writing agent code before the provider prerequisites are verified**
  (the "I thought we were using ADK" pivot — paid for once)
- **Mixing SDKs without a feature flag** — if `discipline_gates.model_provider`
  says `vertex-gemini-adc`, no `from anthropic import` outside an
  explicit fallback block
- **Hard-coding API keys in env vars** — Anthropic keys go through
  Secret Manager + `--set-secrets`, never plain `--set-env-vars`

---

## Provider selection — the hard prerequisites

Before scaffolding ANY agent code, you MUST pick the provider and verify
its prerequisites. Skipping this produces the "we wired Anthropic
everywhere then realized we needed Vertex ADK" pivot — half a day on
credit-memo-commercial.

### Quick chooser

| If you need… | Provider |
|---|---|
| GCP-native, ADC auth, no API keys to manage, lowest network friction | **Vertex Gemini ADC** |
| Server-enforced structured output (`response_schema`) | **Vertex Gemini ADC** |
| Long-context Anthropic-specific reasoning (≥200K), prompt caching | **Anthropic API** |
| Both, with feature-flag routing | **Hybrid** (declare both prerequisite blocks below) |

### Vertex Gemini ADC — prerequisites checklist

- [ ] GCP project has Vertex AI API enabled in the target region
- [ ] Runtime SA has `roles/aiplatform.user`
- [ ] ADC works (Cloud Run automatic; local needs `gcloud auth application-default login`)
- [ ] Region pinned in `discipline_gates.model_provider.region`
- [ ] VPC connector + egress allow `*.googleapis.com`
- [ ] SDK pinned: `google-genai = "^0.7.0"`
- [ ] Canonical call site: `genai.Client(vertexai=True, project=, location=)`
- [ ] Structured-output agents declare `response_schema` (Rule 2)

### Anthropic API — prerequisites checklist

- [ ] API key in Secret Manager (NOT env var, NOT `.env`)
- [ ] Key starts with `sk-ant-api` — `sk-ant-oat` is rejected
- [ ] Cloud Run mounts via `--set-secrets ANTHROPIC_API_KEY=...:latest`
- [ ] Network egress to `api.anthropic.com` is allowed (check VPC mode)
- [ ] Cost ceiling declared in `reasons.yaml#requirements.budget`
- [ ] Stub fallback when key absent — loud, with `synthesized: true` (Rule 3)

### Walkthrough at scaffold time

`/new-use-case` Step 2B asks the team to fill in:

```yaml
discipline_gates:
  model_provider:
    default: vertex-gemini-adc        # | anthropic-api-key | hybrid
    region: us-central1                # required if vertex
    auth: adc                          # | secret-manager-key
    overrides_per_role:                # role-level overrides
      memo_drafter: vertex-gemini-adc
```

If the team can't answer "which provider per role?", the use case is
NOT ready for build — it's still in design. Don't paper over it.

### CI gates

- `scripts/lint_agent_calls.py` — Rule 2 (response_schema for Vertex)
- `scripts/lint_assert_env.py` — Rule 20 (env hard-fails at boot)
- `scripts/smoke_e2e.sh` — asserts each `agent_action` event's `model`
  field matches the declared provider (no silent fallback to stub)

### Full prerequisites

`docs/methodology/model-prerequisites.md` — read it once for context,
keep it open while authoring. Every common failure mode + fix is in
there. Common SDK-specific failure modes:

- Vertex `PermissionDenied` → add `roles/aiplatform.user`
- Vertex region-not-available → check the region matrix before pinning
- Anthropic 401 → key format wrong (must be `sk-ant-api*`)
- Anthropic egress timeout → VPC connector blocks `api.anthropic.com`
- Schema rejection → Vertex's `response_schema` is OpenAPI 3 subset
  (no `$ref`, no `oneOf`, no `additionalProperties`)
