"""
{{SERVICE_NAME}}: {{DESCRIPTION}}

Atomic service. Pure function. No shared state. No decisioning.
Step 2 of the 5-step paradigm.
"""
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from opentelemetry import trace

# Bank conventions: structured, redacting logger
# from common.redacting_logger import get_logger
# logger = get_logger(__name__)
logger = logging.getLogger(__name__)

tracer = trace.get_tracer(__name__)
app = FastAPI(title="{{SERVICE_NAME}}")


class {{ServiceName}}Input(BaseModel):
    """Input schema. Replace fields with use-case specifics."""
    context_id: str = Field(..., description="Universal correlation key")
    # TODO: add use-case-specific input fields


class {{ServiceName}}Output(BaseModel):
    """Output schema. Replace fields with use-case specifics."""
    context_id: str
    # TODO: add use-case-specific output fields


@app.post("/v1/compute", response_model={{ServiceName}}Output)
async def compute(req: {{ServiceName}}Input) -> {{ServiceName}}Output:
    """Pure-function computation. No side effects beyond observability."""
    with tracer.start_as_current_span("atomic.{{SERVICE_NAME}}.compute") as span:
        span.set_attribute("context_id", req.context_id)
        try:
            result = _compute(req)
            return result
        except ValueError as exc:
            logger.warning("Validation error", extra={"context_id": req.context_id})
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            logger.exception("Computation failed", extra={"context_id": req.context_id})
            raise HTTPException(500, "internal_error") from exc


def _compute(req: {{ServiceName}}Input) -> {{ServiceName}}Output:
    """The actual computation. Implement this."""
    # TODO: replace with real computation
    raise NotImplementedError("Implement {{SERVICE_NAME}} compute logic")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
