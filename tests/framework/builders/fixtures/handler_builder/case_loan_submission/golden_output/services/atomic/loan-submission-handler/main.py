"""loan-submission-handler — Pub/Sub push step-1 handler.

Receives loans.application.submitted, validates, enriches, publishes to
credit-memo-commercial.enriched. No business logic; pure transport.
"""
from __future__ import annotations

import base64
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import functions_framework
from google.cloud import pubsub_v1
from opentelemetry import trace

try:
    from bank.logging import redacting_logger
except ImportError:
    import logging as _logging
    def redacting_logger(name: str) -> _logging.Logger:
        return _logging.getLogger(name)

logger = redacting_logger("loan-submission-handler")
tracer = trace.get_tracer(__name__)
SERVICE_NAME = "loan-submission-handler"

REQUIRED = {"borrower_id", "loan_amount", "loan_type", "application_id"}
_publisher: pubsub_v1.PublisherClient | None = None


def _get_publisher() -> pubsub_v1.PublisherClient:
    global _publisher
    if _publisher is None:
        _publisher = pubsub_v1.PublisherClient()
    return _publisher


def _topic_path() -> str:
    project = os.environ["GCP_PROJECT"]
    topic = os.environ.get("ENRICHED_TOPIC", "credit-memo-commercial.enriched")
    return _get_publisher().topic_path(project, topic)


def _decode(envelope: dict[str, Any]) -> dict[str, Any]:
    raw = envelope.get("message", {}).get("data", "")
    if not raw:
        raise ValueError("missing message.data")
    return json.loads(base64.b64decode(raw).decode())


def _enrich(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **payload,
        "context_id": payload.get("context_id") or str(uuid.uuid4()),
        "received_at": datetime.now(timezone.utc).isoformat(),
        "handler": SERVICE_NAME,
    }


@functions_framework.http
def handle(request: Any) -> Any:
    with tracer.start_as_current_span(SERVICE_NAME):
        try:
            envelope = request.get_json(force=True) or {}
            payload = _decode(envelope)
            missing = REQUIRED - payload.keys()
            if missing:
                raise ValueError(f"missing fields: {sorted(missing)}")
            enriched = _enrich(payload)
            data = json.dumps(enriched).encode()
            _get_publisher().publish(_topic_path(), data).result(timeout=30)
            return ("", 204, {})
        except (ValueError, json.JSONDecodeError) as e:
            logger.warning("validation_error", extra={"error": str(e)})
            return (str(e), 400, {})
        except Exception as e:
            logger.error("unexpected_error", extra={"error": str(e)})
            return ("internal", 500, {})


main = handle
