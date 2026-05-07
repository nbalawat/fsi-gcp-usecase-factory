"""
Credit-Memo Commercial — Cloud Run Pub/Sub push handler (step 1 of 5).

Responsibility: receive `loans.application.submitted` Pub/Sub push messages,
validate the schema, normalise field types, add enrichment stubs, and publish
the enriched payload to the `credit-memo-commercial.enriched` topic.

NO business logic lives here.  Rules belong in services/rules-service/.
"""

import base64
import json
import os
import uuid
from datetime import datetime, timezone

import functions_framework
from google.cloud import pubsub_v1

try:
    from bank.logging import redacting_logger
except ImportError:
    import logging as _logging
    def redacting_logger(name: str) -> _logging.Logger:  # type: ignore[misc]
        return _logging.getLogger(name)

logger = redacting_logger("credit-memo-commercial.handler")

# ---------------------------------------------------------------------------
# Required fields on the inbound event payload
# ---------------------------------------------------------------------------
REQUIRED_FIELDS = {"borrower_id", "loan_amount", "loan_type"}

# ---------------------------------------------------------------------------
# Pub/Sub publisher — instantiated once at module load to reuse gRPC channel
# ---------------------------------------------------------------------------
_publisher: pubsub_v1.PublisherClient | None = None


def _get_publisher() -> pubsub_v1.PublisherClient:
    global _publisher
    if _publisher is None:
        _publisher = pubsub_v1.PublisherClient()
    return _publisher


def _enriched_topic_path() -> str:
    # Fail-closed: GCP_PROJECT must be set; never default to a hardcoded project ID.
    project = os.environ["GCP_PROJECT"]
    topic = os.environ.get("ENRICHED_TOPIC", "credit-memo-commercial.enriched")
    return _get_publisher().topic_path(project, topic)


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------
@functions_framework.http
def handle_loan_submitted(request):
    """
    Pub/Sub push endpoint.

    Expected request body (Pub/Sub push envelope):
    {
        "message": {
            "data": "<base64-encoded JSON>",
            "messageId": "...",
            "publishTime": "..."
        },
        "subscription": "..."
    }
    """
    # ------------------------------------------------------------------
    # 1. Parse the Pub/Sub push envelope
    # ------------------------------------------------------------------
    try:
        envelope = request.get_json(silent=True) or {}
        message = envelope.get("message", {})
        raw_data = message.get("data", "")
        message_id = message.get("messageId", str(uuid.uuid4()))
        payload = json.loads(base64.b64decode(raw_data).decode("utf-8"))
    except Exception as exc:
        logger.warning("Failed to decode Pub/Sub envelope", extra={"error": str(exc)})
        return {"error": "malformed_envelope", "detail": str(exc)}, 400

    # ------------------------------------------------------------------
    # 2. Schema validation — reject missing required fields immediately
    # ------------------------------------------------------------------
    missing = REQUIRED_FIELDS - set(payload.keys())
    if missing:
        logger.warning(
            "Validation failure: missing required fields",
            extra={"missing_fields": sorted(missing)},
        )
        return {
            "error": "validation_error",
            "missing_fields": sorted(missing),
        }, 400

    # ------------------------------------------------------------------
    # 3. Normalise / enrich — no business decisions here
    # ------------------------------------------------------------------
    context_id = payload.get("context_id") or message_id

    enriched = {
        # ---- original fields (pass-through) ----
        **payload,
        # ---- normalised identifiers ----
        "context_id": context_id,
        "source_message_id": message_id,
        # ---- handler timestamp ----
        "handler_received_at": datetime.now(timezone.utc).isoformat(),
        # ---- enrichment stubs ----
        # TODO: fetch from Cloud Spanner borrower-master
        #   client = spanner.Client(project=GCP_PROJECT)
        #   instance = client.instance("banking-core")
        #   database = instance.database("borrower-master")
        #   with database.snapshot() as snap:
        #       row = snap.read("Borrowers", ["name","sic_code","tier1_exposure"],
        #                       keyset=KeySet(keys=[[payload["borrower_id"]]]))
        "borrower_master": None,
        # TODO: fetch GCS blob reference from financial-statement-store
        #   storage_client = storage.Client()
        #   bucket = storage_client.bucket("financial-statement-store")
        #   blob = bucket.blob(f"{payload['borrower_id']}/latest.pdf")
        #   gcs_uri = f"gs://financial-statement-store/{payload['borrower_id']}/latest.pdf"
        "financial_statement_blob": None,
    }

    # ------------------------------------------------------------------
    # 4. Publish enriched payload to downstream topic
    # ------------------------------------------------------------------
    try:
        publisher = _get_publisher()
        topic_path = _enriched_topic_path()
        future = publisher.publish(
            topic_path,
            data=json.dumps(enriched).encode("utf-8"),
            context_id=context_id,
            event_type="loans.application.enriched",
        )
        published_message_id = future.result(timeout=10)
        logger.info(
            "Enriched payload published",
            extra={
                "context_id": context_id,
                "published_message_id": published_message_id,
                "topic": topic_path,
            },
        )
    except Exception as exc:
        logger.error(
            "Failed to publish enriched payload",
            extra={"context_id": context_id, "error": str(exc)},
        )
        return {"error": "publish_failed", "detail": str(exc)}, 500

    return {"status": "ok", "context_id": context_id}, 200
