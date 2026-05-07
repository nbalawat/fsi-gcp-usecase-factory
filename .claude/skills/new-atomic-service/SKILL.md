---
name: new-atomic-service
description: Scaffold a pure-function atomic service (step 2 of the 5-step paradigm) → Cloud Run + FastAPI + MCP manifest + tests + Terraform → validates before declaring done.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*, ls:*, cat:*, mkdir:*, terraform:*, gcloud:*, pytest:*, ruff:*, mypy:*, conftest:*)
---

You are scaffolding a new atomic service.

## Step 1 — Gather context

Ask for, one at a time:

1. **Service name** (kebab-case). Will become the directory name. Examples: `ofac-screen`, `dti-calc`, `merchant-risk-score`.
2. **What it computes** in one sentence. Should be a pure function. Examples:
   - "Returns OFAC sanctions screening result for a given party."
   - "Computes debt-to-income ratio from income and obligations."
3. **Inputs** as Pydantic model fields (name, type, description for each).
4. **Outputs** as Pydantic model fields (same).
5. **Reference data needed** (Bigtable, BigQuery, external API via MCP — never direct).

## Step 2 — Verify reuse

Run `ls services/atomic/`. Read each `manifest.json`. If any service substantially overlaps with the proposed one, STOP and tell the user:

```
A similar service already exists: services/atomic/{existing}
  Description: {existing description}

Options:
  (a) Reuse the existing service — refer me to it
  (b) Extend the existing service — add a new endpoint/method
  (c) Create a new service — explain why it's distinct
```

Wait for direction before proceeding.

## Step 3 — Verify the service is truly atomic

Refuse to proceed if:

- The service would call another atomic service → suggest moving orchestration to the workflow
- The service would contain business rules / thresholds → suggest moving rules to JDM
- The service would make decisions → suggest moving to an agent
- The service would call external APIs directly → require an MCP tool wrapper

Cite the rule from `CLAUDE.md` when refusing.

## Step 4 — Scaffold from template

Read templates from `${CLAUDE_PLUGIN_DIR}/skills/new-atomic-service/template/`. (Template files will be added in subsequent plugin releases. For v0.1.0, generate from the patterns below.)

Generate at `services/atomic/{service_name}/`:

**main.py:**

```python
"""
{service_name}: {one-sentence description}

Atomic service. Pure function. No shared state. No decisioning.
"""
import logging
from typing import Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from opentelemetry import trace

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)
app = FastAPI(title="{service_name}")


class {ServiceName}Input(BaseModel):
    # Fill in based on user input
    pass


class {ServiceName}Output(BaseModel):
    # Fill in based on user output
    pass


@app.post("/v1/compute", response_model={ServiceName}Output)
async def compute(req: {ServiceName}Input) -> {ServiceName}Output:
    """Pure-function computation. No side effects beyond observability."""
    with tracer.start_as_current_span("{service_name}.compute") as span:
        span.set_attribute("context_id", req.context_id if hasattr(req, "context_id") else "unknown")
        try:
            result = _compute(req)
            return result
        except Exception as exc:
            logger.exception("Computation failed")
            raise HTTPException(500, str(exc)) from exc


def _compute(req: {ServiceName}Input) -> {ServiceName}Output:
    # User fills this in. The skill leaves a TODO.
    raise NotImplementedError("Fill in the actual computation")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
```

**manifest.json** (MCP manifest so agents can call this as a tool):

```json
{
  "name": "{service_name}",
  "version": "1.0.0",
  "description": "{one-sentence description}",
  "endpoint": "https://{service_name}-${PROJECT_HASH}.a.run.app/v1/compute",
  "method": "POST",
  "input_schema": { /* generated from {ServiceName}Input */ },
  "output_schema": { /* generated from {ServiceName}Output */ },
  "owner": "platform-team",
  "category": "atomic-service"
}
```

**Dockerfile:**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY . .
ENV PORT=8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**pyproject.toml:** include FastAPI, uvicorn, Pydantic 2, OpenTelemetry, the bank's structured logger.

**service.tf:**

```hcl
module "{service_name}" {
  source = "../../infra/modules/atomic_service"
  name   = "{service_name}"
  region = var.region
  project = var.project
  image_tag = var.image_tag
  # ... follows the bank's atomic_service module contract
}
```

**tests/test_main.py:** delegate to test-author subagent.

## Step 5 — Generate tests via subagent

```
Use the test-author subagent to write tests for services/atomic/{service_name}/.
Required coverage:
  - Happy path test
  - Schema violation test (input doesn't match Pydantic model)
  - Error path test (computation raises)
  - Property-based tests using Hypothesis if outputs are numeric
  - Contract test against the MCP manifest schema
Coverage threshold: 90%.
```

## Step 6 — Generate Terraform via subagent

```
Use the terraform-author subagent to write infra/atomic_services/{service_name}.tf.
Use the bank's atomic_service Terraform module. Configure:
  - Cloud Run service
  - Service account with minimum needed permissions
  - Secret references (if any)
  - VPC connector if reference data is in Bigtable/AlloyDB
  - OTel collector wiring
```

## Step 7 — Validate

Run in this order. Stop and report on first failure:

```bash
cd services/atomic/{service_name}
ruff check .
ruff format --check .
mypy --strict .
pytest tests/ -x --cov=. --cov-fail-under=90
cd ../../..

# Manifest validation
python -m jsonschema -i services/atomic/{service_name}/manifest.json \
  ${CLAUDE_PLUGIN_DIR}/policies/mcp_manifest_schema.json

# Terraform
terraform fmt -check infra/atomic_services/{service_name}.tf
terraform validate infra/

# Bank policies
conftest test --policy ${CLAUDE_PLUGIN_DIR}/policies/ infra/atomic_services/{service_name}.tf
```

## Step 8 — Architecture audit

```
Use the architecture-auditor subagent to review services/atomic/{service_name}/.
Check specifically:
  - Service is atomic (no calls to other atomic services)
  - No business rules / thresholds in the code
  - No decisioning (just computation)
  - Observability instrumented (OTel span, structured logging)
  - MCP manifest matches the actual API
```

## Step 9 — Optional dry-run deploy

If `GCP_PROJECT_SANDBOX` env var is set, offer to dry-run deploy:

```bash
bash ${CLAUDE_PLUGIN_DIR}/scripts/deploy_preview.sh atomic {service_name}
```

This builds the container, deploys to sandbox project (no traffic), verifies health check, tears down. Catches deployment issues that static checks miss.

## Step 10 — Report

```
✓ Atomic service created: services/atomic/{service_name}
  Files: main.py, manifest.json, Dockerfile, pyproject.toml, service.tf, tests/
  Tests: {N} tests, {coverage}% coverage
  Validation: PASS
  Audit: PASS

Next:
  1. Fill in the _compute() function in services/atomic/{service_name}/main.py
  2. Add domain-specific test cases in tests/test_main.py
  3. The service is now available for agents and workflows to call via MCP
```
