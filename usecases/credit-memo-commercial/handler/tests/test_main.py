"""
Unit tests for the credit-memo-commercial Cloud Run handler.

All Pub/Sub interactions are mocked; no GCP credentials required.
"""

import base64
import json
import unittest
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Build a minimal Flask test client that exercises the handler function
# ---------------------------------------------------------------------------


def _make_request(payload: dict, message_id: str = "msg-001") -> MagicMock:
    """Return a mock Flask request carrying a Pub/Sub push envelope."""
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    envelope = {
        "message": {
            "data": encoded,
            "messageId": message_id,
            "publishTime": "2026-05-06T00:00:00Z",
        },
        "subscription": "projects/agentic-experiments/subscriptions/credit-memo-handler-sub",
    }
    req = MagicMock()
    req.get_json.return_value = envelope
    return req


def _invoke(request):
    """
    Call the handler and normalise the return value.

    The handler returns either (body, status) or body.
    Always returns (body_dict, status_int).
    """
    from main import handle_loan_submitted  # noqa: PLC0415

    result = handle_loan_submitted(request)
    if isinstance(result, tuple):
        body, status = result
    else:
        body, status = result, 200
    return body, status


# ---------------------------------------------------------------------------
# Helper: a valid base payload
# ---------------------------------------------------------------------------
VALID_PAYLOAD = {
    "borrower_id": "DEMO-MFG-001",
    "loan_amount": 5_000_000,
    "loan_type": "term",
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestValidPayloadPublishes:
    """test_valid_payload_publishes — happy path publishes to enriched topic."""

    def test_valid_payload_publishes(self):
        mock_future = MagicMock()
        mock_future.result.return_value = "published-msg-id-999"

        mock_publisher = MagicMock()
        mock_publisher.publish.return_value = mock_future
        mock_publisher.topic_path.return_value = (
            "projects/agentic-experiments/topics/credit-memo-commercial.enriched"
        )

        with patch("main._publisher", mock_publisher):
            body, status = _invoke(_make_request(VALID_PAYLOAD))

        assert status == 200
        assert body["status"] == "ok"
        assert "context_id" in body
        mock_publisher.publish.assert_called_once()

        # Verify the topic path used
        call_args = mock_publisher.publish.call_args
        assert "credit-memo-commercial.enriched" in call_args[0][0]


class TestMissingBorrowerId:
    """test_missing_borrower_id_returns_400."""

    def test_missing_borrower_id_returns_400(self):
        bad_payload = {"loan_amount": 5_000_000, "loan_type": "term"}
        body, status = _invoke(_make_request(bad_payload))

        assert status == 400
        assert body["error"] == "validation_error"
        assert "borrower_id" in body["missing_fields"]


class TestMissingLoanAmount:
    """test_missing_loan_amount_returns_400."""

    def test_missing_loan_amount_returns_400(self):
        bad_payload = {"borrower_id": "DEMO-MFG-001", "loan_type": "term"}
        body, status = _invoke(_make_request(bad_payload))

        assert status == 400
        assert body["error"] == "validation_error"
        assert "loan_amount" in body["missing_fields"]


class TestContextIdGeneratedFromMessageId:
    """test_context_id_generated_from_message_id."""

    def test_context_id_generated_from_message_id(self):
        """When the payload has no context_id, the handler derives it from messageId."""
        mock_future = MagicMock()
        mock_future.result.return_value = "pub-id-x"

        mock_publisher = MagicMock()
        mock_publisher.publish.return_value = mock_future
        mock_publisher.topic_path.return_value = (
            "projects/agentic-experiments/topics/credit-memo-commercial.enriched"
        )

        specific_message_id = "smoke-test-777"
        request = _make_request(VALID_PAYLOAD, message_id=specific_message_id)

        with patch("main._publisher", mock_publisher):
            body, status = _invoke(request)

        assert status == 200
        # context_id should equal the message_id since none was in the payload
        assert body["context_id"] == specific_message_id

    def test_context_id_preserved_when_present_in_payload(self):
        """When the payload already carries a context_id it must not be overwritten."""
        mock_future = MagicMock()
        mock_future.result.return_value = "pub-id-y"

        mock_publisher = MagicMock()
        mock_publisher.publish.return_value = mock_future
        mock_publisher.topic_path.return_value = (
            "projects/agentic-experiments/topics/credit-memo-commercial.enriched"
        )

        payload_with_ctx = {**VALID_PAYLOAD, "context_id": "upstream-ctx-abc"}
        with patch("main._publisher", mock_publisher):
            body, status = _invoke(_make_request(payload_with_ctx, message_id="msg-different"))

        assert status == 200
        assert body["context_id"] == "upstream-ctx-abc"


class TestEnrichedPayloadPublishedWithCorrectTopic:
    """test_enriched_payload_published_with_correct_topic."""

    def test_enriched_payload_published_with_correct_topic(self):
        """The published message data must contain all original fields plus enrichment keys."""
        published_data: dict = {}

        def capture_publish(topic_path, data, **kwargs):
            published_data["topic"] = topic_path
            published_data["body"] = json.loads(data.decode())
            published_data["attrs"] = kwargs
            mock_future = MagicMock()
            mock_future.result.return_value = "pub-id-z"
            return mock_future

        mock_publisher = MagicMock()
        mock_publisher.publish.side_effect = capture_publish
        mock_publisher.topic_path.return_value = (
            "projects/agentic-experiments/topics/credit-memo-commercial.enriched"
        )

        with patch("main._publisher", mock_publisher):
            body, status = _invoke(_make_request(VALID_PAYLOAD, message_id="ctx-test-001"))

        assert status == 200

        # Topic must be the enriched topic
        assert "credit-memo-commercial.enriched" in published_data["topic"]

        # Published body must contain original fields
        enriched = published_data["body"]
        assert enriched["borrower_id"] == VALID_PAYLOAD["borrower_id"]
        assert enriched["loan_amount"] == VALID_PAYLOAD["loan_amount"]
        assert enriched["loan_type"] == VALID_PAYLOAD["loan_type"]

        # Enrichment keys must be present
        assert "context_id" in enriched
        assert "handler_received_at" in enriched
        assert "borrower_master" in enriched
        assert "financial_statement_blob" in enriched

        # Pub/Sub message attribute
        assert published_data["attrs"]["event_type"] == "loans.application.enriched"
