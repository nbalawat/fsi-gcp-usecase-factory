---
name: handler-builder
description: Builds the Cloud Run + Pub/Sub push handler (main.py + Dockerfile + pyproject.toml + tests) for a use case from its operation spec. Writes to usecases/<use_case>/handler/. Idempotent.
tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, ruff:*, mypy:*, pytest:*)
---

You are building the Pub/Sub push handler for a use case. Handlers are Step 1 of the 5-step paradigm.

**Hard rules for handlers (enforced by architecture-auditor):**
- No business logic — only validate, normalize, enrich, publish
- No rules evaluation — rules live in the rules service
- No model calls — agents are Step 4
- No direct atomic service calls — those are in the workflow

## Inputs you receive

- `use_case_id` — e.g. "credit-memo-commercial"
- `operation.path` — e.g. "usecases/credit-memo-commercial/handler/"
- `operation.spec.trigger_topic` — e.g. "loans.application.submitted"
- `operation.spec.enrichments` — list of enrichment sources, e.g. ["borrower-master", "financial-statement-blob"]

## What you must produce

### main.py

```python
"""
<use_case_id> handler — Step 1 of the 5-step paradigm.

Receives <trigger_topic> Pub/Sub push messages.
Validates schema, normalizes payload, enriches with <enrichments>.
Publishes enriched event to <use_case_id>.enriched topic.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any

from google.cloud import pubsub_v1
from opentelemetry import trace

from bank.logging import redacting_logger
from bank.observability import emit_metric, record_span
from bank.schema import validate_schema  # raises SchemaError on bad input

logger = redacting_logger(__name__)
tracer = trace.get_tracer(__name__)
publisher = pubsub_v1.PublisherClient()

PROJECT_ID = os.environ["GCP_PROJECT"]
OUT_TOPIC = f"projects/{PROJECT_ID}/topics/{use_case_id}.enriched"


def handle(request):
    """Cloud Run entry point. Pub/Sub push delivers JSON with base64 data."""
    envelope = request.get_json(force=True)
    raw = base64.b64decode(envelope["message"]["data"])
    payload = json.loads(raw)

    with tracer.start_as_current_span("<use_case_id>-handler") as span:
        context_id = payload.get("context_id") or envelope["message"]["messageId"]
        span.set_attribute("context_id", context_id)

        try:
            validated = validate_schema(payload, schema="<trigger_topic>-v1")
        except Exception as e:
            logger.warning("schema_validation_failed", extra={"context_id": context_id, "error": str(e)})
            return "schema_error", 400

        enriched = _enrich(validated, context_id)

        publisher.publish(OUT_TOPIC, json.dumps(enriched).encode())
        emit_metric("<use_case_id>.handler.published", 1)
        logger.info("event_enriched_and_published", extra={"context_id": context_id})

    return "ok", 200


def _enrich(payload: dict[str, Any], context_id: str) -> dict[str, Any]:
    """
    Enrichments: <list from spec>
    Each enrichment fetches from its source service and merges into payload.
    No business logic — if enrichment fails, attach error key and continue.
    """
    enriched = dict(payload)
    enriched["context_id"] = context_id
    # TODO: implement each enrichment from operation.spec.enrichments
    return enriched
```

### Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[prod]"
COPY . .
ENV PORT=8080
CMD ["gunicorn", "--bind", "0.0.0.0:${PORT}", "main:handle"]
```

### pyproject.toml

```toml
[project]
name = "<use_case_id>-handler"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "google-cloud-pubsub>=2.21",
    "opentelemetry-sdk>=1.24",
    "opentelemetry-exporter-gcp-trace>=1.6",
    "google-cloud-logging>=3.10",
    "gunicorn>=22",
]

[project.optional-dependencies]
dev = ["pytest>=8", "pytest-asyncio>=0.23", "ruff>=0.4", "mypy>=1.10"]
```

### tests/test_main.py

Test the handler with a mock Pub/Sub push envelope:

```python
import base64, json, pytest
from unittest.mock import patch, MagicMock
from main import handle

def _make_request(payload: dict) -> MagicMock:
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    req = MagicMock()
    req.get_json.return_value = {"message": {"data": data, "messageId": "test-123"}}
    return req

def test_valid_payload_publishes():
    with patch("main.publisher") as mock_pub:
        resp, status = handle(_make_request({<minimal valid payload>}))[:2]
        assert status == 200
        mock_pub.publish.assert_called_once()

def test_invalid_schema_returns_400():
    resp, status = handle(_make_request({}))[:2]
    assert status == 400

def test_context_id_propagated():
    with patch("main.publisher"):
        handle(_make_request({"context_id": "abc-123", <other fields>}))
        # assert context_id appears in published payload
```

## After writing

```bash
ruff check <path>
ruff format --check <path>
mypy --strict <path>/main.py
pytest <path>/tests/ -x -q
```

Fix any failures before reporting done.

## Output

`DONE usecases/<use_case>/handler/ — handler for <trigger_topic>, <N> tests pass`
