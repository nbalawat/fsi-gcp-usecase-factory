---
name: handler-design
description: Knowledge for designing step-1 handlers in the bank's 5-step paradigm. Auto-invoked when files in usecases/<uc>/handler/ are being read, written, or edited. Handlers are Cloud Run + Pub/Sub push services that ingest events, validate schemas, normalize, enrich, and publish to the next topic. They must not contain business logic.
---

# Handler design

A handler is the entry point for events into a use case. It does exactly four things, in order:

1. **Receive** a Pub/Sub push message (from Pub/Sub Schema Registry)
2. **Validate** the schema (Pub/Sub Schemas does this; trust it; the handler asserts the parsed payload)
3. **Normalize and enrich** — without making business decisions
4. **Publish** to the next topic in the use case's topology

That is the entire job. Anything beyond this is in the wrong place.

## The hard rules

- Never put business logic in a handler. No "if amount > X" decisions. Those go in the rules service or the agent.
- Never call another atomic service from a handler. Atomic services are tools the workflow or agent uses, not the handler.
- Never call external APIs from a handler. If you need data, normalize what's in the payload; the workflow can pull more.
- Never write to BigQuery audit tables from a handler. The workflow does that.
- Always emit OpenTelemetry spans named `handler.{use_case}.{operation}`.
- Always propagate `context_id` from the incoming message to all outgoing messages.
- Always use the structured logger with PII redaction.
- Always return a 2xx response to Pub/Sub even if processing fails (use DLQ, not retry storm).

## The shape of a handler

```python
"""
{use_case} handler.

Step 1 of the 5-step paradigm. Ingest, validate, normalize, publish.
No business logic.
"""
import logging
from fastapi import FastAPI, HTTPException
from google.cloud import pubsub_v1
from opentelemetry import trace
from pydantic import BaseModel

from .schemas import IncomingEvent, NormalizedEvent
from .normalize import normalize, enrich

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)
app = FastAPI()
publisher = pubsub_v1.PublisherClient()
NEXT_TOPIC = "projects/PROJECT/topics/{use_case}.normalized"


@app.post("/")
async def receive_pubsub(envelope: dict) -> dict:
    """Pub/Sub push endpoint. Pub/Sub will retry on 5xx; DLQ on persistent failure."""
    with tracer.start_as_current_span("handler.{use_case}.receive") as span:
        try:
            # Pub/Sub envelope structure: {"message": {"data": base64, "attributes": {...}}}
            payload = _decode_pubsub(envelope)
            event = IncomingEvent.model_validate(payload)
            context_id = event.context_id or _generate_context_id()
            span.set_attribute("context_id", context_id)

            # Step 3: normalize and enrich
            normalized = normalize(event)
            enriched = enrich(normalized)

            # Step 4: publish
            await _publish(NEXT_TOPIC, enriched, context_id)

            return {"status": "ok"}
        except ValidationError as e:
            # Bad message → DLQ, not retry
            logger.error("Schema violation", extra={"error": str(e)})
            return {"status": "rejected", "reason": "schema_violation"}, 200
        except Exception as e:
            logger.exception("Handler failed")
            # Let Pub/Sub retry by returning 5xx, will go to DLQ after attempts exhausted
            raise HTTPException(500, "internal error") from e


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
```

## The shape of `normalize()` and `enrich()`

`normalize()` is data shape transformation — the point is that downstream consumers don't need to know the source format. ISO 20022 → bank's canonical event. SWIFT MT → bank's canonical event. CSV row → bank's canonical event.

`enrich()` is reference-data lookups that don't make decisions — adding the customer's segment, looking up the merchant's MCC, joining the originating channel. These are factual additions, not judgments.

If you find yourself wanting `enrich()` to compute a risk score or decide an action, stop. Those go in the agent or rules service.

## Schemas

Use Pydantic v2 models. Keep them in `schemas.py` next to the handler. The `IncomingEvent` model should match the Pub/Sub schema registered in Pub/Sub Schema Registry. The `NormalizedEvent` model should be the canonical bank-internal shape.

## Tests required

At minimum:
- Happy path: a valid event flows through, gets published correctly
- Schema violation: bad payload returns 200 with rejection reason (so Pub/Sub doesn't retry)
- Downstream failure: publisher fails, handler raises 500 (so Pub/Sub does retry)
- context_id propagation: outgoing message has the same context_id as incoming

## Observability

Required OTel spans:
- `handler.{use_case}.receive`
- `handler.{use_case}.normalize`
- `handler.{use_case}.enrich`
- `handler.{use_case}.publish`

Each span tags with `context_id`. Spans go to Cloud Trace.

Required logs:
- One info log on receive
- One info log on publish
- Error logs on failures with redacted payload reference (not payload itself if PII)

## Anti-patterns to refuse

- Handlers with business logic
- Handlers that call atomic services
- Handlers that call external APIs
- Handlers that write to multiple topics (use a fan-out workflow instead)
- Handlers that don't propagate context_id
- Handlers without OTel instrumentation
- Handlers that log raw PII

When you see one of these in code, flag it for refactoring. The architecture-auditor will fail PRs that introduce them.
