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

