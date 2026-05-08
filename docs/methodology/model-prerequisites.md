# Model-provider prerequisites

The platform runs **only two production models** (per CLAUDE.md):

- **`claude-opus-4-7`** — long-form reasoning, document IQ, narratives, multi-step decisioning
- **`gemini-3-1-flash`** — real-time scoring, high-volume classification, sub-second decisions

But picking the model is the easy part. The expensive part is the
**provider prerequisites** — auth, region, SDK, network, IAM, fallback.
Skipping any of these produces the kind of "I thought we were using
Vertex" pivot we paid for during the credit-memo-commercial build,
where we wired Anthropic-API calls everywhere before the user surfaced
that ADK on Vertex was the actual target. The rewrite cost a half-day
plus three orchestrator deploys.

This doc codifies the prerequisites so every new use case declares them
at scaffold time (Step 2B of `/new-use-case`) and CI enforces them at
review time.

---

## Decision: pick provider per agent role

Every agent role in the use case declares one provider:

```yaml
# usecases/<uc>/reasons.yaml
discipline_gates:
  model_provider:
    default: vertex-gemini-adc          # the default for THIS use case
    region: us-central1                  # must match Cloud Run region
    auth: adc                            # | secret-manager-key | hybrid
    overrides_per_role:
      memo_drafter: vertex-gemini-adc    # role-level override
      doc_classifier: vertex-gemini-adc
```

The orchestrator's call site MUST match this declaration. If it
imports `from anthropic import Anthropic` while the gate says
`vertex-gemini-adc`, the build fails (Rule 2 lint catches the wrong
SDK).

---

## Vertex Gemini prerequisites

### What you must have before writing any agent code

| # | Prerequisite | How to verify |
|---|---|---|
| 1 | **GCP project with Vertex AI API enabled** in your target region | `gcloud services list --enabled --project=$GCP_PROJECT \| grep aiplatform.googleapis.com` |
| 2 | **ADC for runtime** | Cloud Run: provided automatically via the service account. Local dev: `gcloud auth application-default login` |
| 3 | **IAM role on runtime SA**: `roles/aiplatform.user` (and `roles/aiplatform.serviceAgent` for batch) | `gcloud projects get-iam-policy $GCP_PROJECT --flatten="bindings[].members" --filter="bindings.members:$SA_EMAIL"` |
| 4 | **Region pinned** to where the service runs (model availability is regional) | `discipline_gates.model_provider.region` matches `gcloud run services describe ... --region=...` |
| 5 | **Quota** for `gemini-3-1-flash` and/or `gemini-2.5-pro` requests / minute | `gcloud quotas list --service=aiplatform.googleapis.com --consumer=projects/$GCP_PROJECT` |
| 6 | **Network egress allowed** from the VPC connector to `*.googleapis.com` (Vertex endpoint) | `gcloud compute networks vpc-access connectors describe ...` + Cloud Run `--vpc-egress=private-ranges-only` is OK because Vertex resolves over Google PSC |
| 7 | **Structured output requires `response_schema`** (Rule 2 in product-build-discipline.md) | Each agent in `discipline_gates.structured_output_agents` has a corresponding `response_schema=` in the orchestrator call site |

### SDK + canonical call site

```python
# pyproject.toml
google-genai = "^0.7.0"

# main.py
from google import genai
from google.genai import types as genai_types

client = genai.Client(
    vertexai=True,
    project=os.environ["GCP_PROJECT"],
    location=os.environ.get("GCP_REGION", "us-central1"),
)

resp = client.models.generate_content(
    model="gemini-2.5-pro",
    contents=json.dumps(user_input),
    config=genai_types.GenerateContentConfig(
        system_instruction=system_prompt,
        response_mime_type="application/json",
        response_schema=DRAFTER_SCHEMA,  # Rule 2
        temperature=0.2,
        max_output_tokens=16384,
    ),
)
```

### Common failure modes (each is a half-day debugging session)

- **`google.api_core.exceptions.PermissionDenied`** — runtime SA lacks `roles/aiplatform.user`. Fix: grant it. Don't add `roles/owner` "to make it work".
- **`Unable to find your project`** — `GCP_PROJECT` env var unset. Rule 20 (env-vars hard-fail at boot) catches this; ensure your service has `_assert_env(["GCP_PROJECT", "GCP_REGION"])`.
- **Model not available in region** — Vertex models roll out region-by-region; check the [model availability matrix](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations) before pinning.
- **Schema rejected** — Vertex's `response_schema` is a subset of OpenAPI 3 (no `$ref`, no `oneOf`, no `additionalProperties`). Use `_drafter_response_schema()` helper or write minimal flat schemas.
- **Latency surprise** — Gemini 2.5 Pro with full-document prompts is ~12-18s. Set Cloud Run `--timeout` to P99 × 1.5 (Rule 21). Default 540s kills 13-agent chains.

---

## Anthropic API prerequisites

### What you must have before writing any agent code

| # | Prerequisite | How to verify |
|---|---|---|
| 1 | **API key in Secret Manager** — NOT env var checked into source, NOT `.env` file | `gcloud secrets describe anthropic-api-key --project=$GCP_PROJECT` |
| 2 | **Key format starts with `sk-ant-api`** | Anthropic SDK rejects `sk-ant-oat...` (OAuth tokens) with HTTP 401. The SDK requires keys provisioned via the [console](https://console.anthropic.com/) |
| 3 | **Cloud Run mounts via `--set-secrets`** | `gcloud run deploy ... --set-secrets=ANTHROPIC_API_KEY=anthropic-api-key:latest` |
| 4 | **Network egress allowed to `api.anthropic.com`** | If using `--vpc-egress=private-ranges-only`, ensure `api.anthropic.com` resolves through the VPC connector (or switch to `--vpc-egress=all-traffic` for that path) |
| 5 | **Cost ceiling declared** in `reasons.yaml#requirements.budget` | Per-case budget; smoke test asserts `sum(cost_usd) <= budget` |
| 6 | **Stub fallback when key absent** (Rule 3) | The orchestrator falls back to `_stub_agent_response()` ONLY with `synthesized: true` flag + UI banner |

### SDK + canonical call site

```python
# pyproject.toml
anthropic = "^0.40.0"

# main.py
import anthropic
client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

msg = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=16384,
    system=system_prompt,
    messages=[{"role": "user", "content": json.dumps(user_input)}],
    temperature=0.2,
)
text_out = msg.content[0].text
```

### Common failure modes

- **HTTP 401 from `client.messages.create`** — usually wrong key format. Verify key starts with `sk-ant-api`. OAuth tokens (`sk-ant-oat`) work for the **Console / SDKs that accept Workbench tokens** but the standard Anthropic Python SDK rejects them.
- **Response is freeform prose, not JSON** — Anthropic doesn't have Vertex-style server-side `response_schema`. Use prompt-only constraint + a normalizer (see `services/orchestrator-credit-memo/main.py:_normalize_drafter_memo`) OR adopt Anthropic's tool-use feature for structured outputs.
- **Egress timeout** — VPC connector + private-ranges-only blocks `api.anthropic.com`. Either route through a NAT or switch the egress mode.
- **Cost surprise** — Opus 4.7 is ~$15 / M input + $75 / M output. A 13-agent memo run at 12K input + 1.5K output per agent ≈ $1.85 / case. Budget accordingly.

---

## Hybrid (both)

Some use cases want Vertex Gemini for speed and Anthropic for the
hardest reasoning step (memo drafting). The pattern:

```python
USE_GEMINI = os.environ.get("USE_GEMINI", "1") == "1"
api_key = os.environ.get("ANTHROPIC_API_KEY")

if USE_GEMINI:
    # Vertex path — primary
    ...
elif api_key:
    # Anthropic path — secondary
    ...
else:
    # Stub fallback (loud — Rule 3)
    synthesized = True
    output = _stub_agent_response(role, output_key, app_id, payload)
```

Both prerequisite blocks above apply. The smoke test (`scripts/smoke_e2e.sh`)
must run in BOTH modes (set the env flag, run with each provider) and
assert determinism if relevant.

---

## CI gates

| Gate | Enforces |
|---|---|
| `scripts/lint_agent_calls.py` | Rule 2 — every `discipline_gates.structured_output_agents` role has `response_schema` |
| `scripts/lint_assert_env.py` | Rule 20 — every required env var hard-fails at boot |
| `scripts/lint_provider_match.py` (NEW) | The orchestrator's SDK imports match `discipline_gates.model_provider`. If gate says `vertex-gemini-adc`, no `from anthropic import` outside an explicit fallback block. |
| `scripts/smoke_e2e.sh` | Asserts the right provider was used (every `agent_action` event payload's `model` field starts with `gemini-` or `claude-`); asserts `stubs: 0` |

---

## When in doubt — the framework asks

`/new-use-case` Step 2B asks the team to fill in `model_provider` for
each agent role before any code is written. The `model-selection` skill
auto-loads when agent files are touched and walks through this doc.

If the team can't answer "which provider per role?" before scaffolding,
that's a sign the use case isn't ready for build — it's still in
design. Don't paper over it; resolve it first.

---

## Reference

Live: `services/orchestrator-credit-memo/main.py:_invoke_agent` —
canonical implementation. Read it before writing a new orchestrator.

Doc: `docs/methodology/product-build-discipline.md` Rule 1 (lock at
scaffold), Rule 2 (response_schema), Rule 3 (stub fallback loud).

Skill: `.claude/skills/model-selection/SKILL.md` — the decision
walkthrough invoked from `/new-use-case`.
