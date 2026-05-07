"""Tests for {{SERVICE_NAME}}."""
import pytest
from fastapi.testclient import TestClient
from main import app, {{ServiceName}}Input, {{ServiceName}}Output

client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_compute_happy_path() -> None:
    """Replace this with a real happy-path test."""
    # TODO: implement after _compute() is implemented
    pytest.skip("Implement {{SERVICE_NAME}}._compute first")


def test_compute_propagates_context_id() -> None:
    """The context_id must be preserved through the service."""
    # TODO: implement
    pytest.skip("Implement after _compute is implemented")


def test_compute_schema_violation() -> None:
    """Malformed input should return 422 (Pydantic validation)."""
    response = client.post("/v1/compute", json={"bogus": "field"})
    assert response.status_code == 422


# Add more tests:
# - Each error branch in _compute()
# - Boundary values for numeric inputs
# - Property-based tests using Hypothesis if outputs are numeric
# - Contract tests: response shape matches MCP manifest
