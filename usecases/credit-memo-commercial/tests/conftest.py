"""
conftest.py for credit-memo-commercial e2e tests.

Provides session-scoped fixtures:
  - gcp_project   : GCP project ID (from env GCP_PROJECT)
  - oidc_token    : OIDC bearer token for @live tests (skips if not set)
  - pubsub_client : google.cloud.pubsub_v1.PublisherClient (skipped for non-live)

Layer 5 (non-live) tests stub all GCP calls; this conftest only enforces that
PUBSUB_EMULATOR_HOST is set when running non-live tests in CI, and that
GCP_PROJECT + GOOGLE_APPLICATION_CREDENTIALS are set for @live tests.
"""
from __future__ import annotations

import os

import pytest

# ---------------------------------------------------------------------------
# Marker registration
# ---------------------------------------------------------------------------

def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "live: requires GCP_PROJECT, GOOGLE_APPLICATION_CREDENTIALS, and deployed stack",
    )


# ---------------------------------------------------------------------------
# Session guard — non-live tests require emulator host
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def check_emulator(request: pytest.FixtureRequest) -> None:
    """Skip the entire session when PUBSUB_EMULATOR_HOST is not set.

    Only applied to non-live tests.  Live tests skip this guard because they
    talk directly to the real GCP Pub/Sub endpoint.
    """
    # If every collected test is @live we don't need the emulator
    live_only = all(
        item.get_closest_marker("live") is not None
        for item in request.session.items
    )
    if live_only:
        return

    host = os.getenv("PUBSUB_EMULATOR_HOST")
    if not host:
        pytest.skip(
            "PUBSUB_EMULATOR_HOST not set — skipping non-live e2e tests. "
            "Start the Pub/Sub emulator or run: export PUBSUB_EMULATOR_HOST=localhost:8085"
        )


# ---------------------------------------------------------------------------
# GCP project fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def gcp_project() -> str:
    """Return the GCP project ID.

    Defaults to 'agentic-experiments' for @live tests.
    Non-live tests use 'test-project' (emulator).
    """
    return os.getenv("GCP_PROJECT", "agentic-experiments")


# ---------------------------------------------------------------------------
# OIDC token fixture — @live only
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def oidc_token(request: pytest.FixtureRequest) -> str | None:
    """Return an OIDC bearer token for authenticating against real Cloud Run endpoints.

    Skips when not running a @live test.  In CI, set OIDC_TOKEN or use
    Workload Identity Federation so `gcloud auth print-identity-token` works.
    """
    # Only required for @live tests
    marker = request.node.get_closest_marker("live")
    if marker is None:
        return None

    token = os.getenv("OIDC_TOKEN")
    if not token:
        try:
            import subprocess
            result = subprocess.run(
                ["gcloud", "auth", "print-identity-token"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                token = result.stdout.strip()
        except Exception:
            pass

    if not token:
        pytest.skip(
            "OIDC_TOKEN not set and 'gcloud auth print-identity-token' failed. "
            "Set OIDC_TOKEN or configure Workload Identity Federation for @live tests."
        )

    return token


# ---------------------------------------------------------------------------
# Pub/Sub publisher client fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def pubsub_client(request: pytest.FixtureRequest):
    """Return a Pub/Sub PublisherClient.

    For non-live tests, the client is pointed at the local emulator via the
    PUBSUB_EMULATOR_HOST environment variable (already set by check_emulator).
    For @live tests, the client uses real GCP credentials.

    Skipped entirely when google-cloud-pubsub is not installed (non-live tests
    use the handler HTTP endpoint directly instead).
    """
    try:
        from google.cloud import pubsub_v1
    except ImportError:
        pytest.skip("google-cloud-pubsub not installed — skipping pubsub_client fixture")
        return None

    return pubsub_v1.PublisherClient()


# ---------------------------------------------------------------------------
# Deployed endpoint URLs (live tests)
# ---------------------------------------------------------------------------

LIVE_ENDPOINTS: dict[str, str] = {
    "financial_spreader": "https://fsi-atomic-financial-spreader-v4uibzu6ga-uc.a.run.app",
    "dscr_calculator": "https://fsi-atomic-dscr-calculator-v4uibzu6ga-uc.a.run.app",
    "covenant_analyzer": "https://fsi-atomic-covenant-analyzer-v4uibzu6ga-uc.a.run.app",
    "peer_benchmarker": "https://fsi-atomic-peer-benchmarker-v4uibzu6ga-uc.a.run.app",
    "industry_risk_scorer": "https://fsi-atomic-industry-risk-scorer-v4uibzu6ga-uc.a.run.app",
    "collateral_valuator": "https://fsi-atomic-collateral-valuator-v4uibzu6ga-uc.a.run.app",
    "exposure_aggregator": "https://fsi-atomic-exposure-aggregator-v4uibzu6ga-uc.a.run.app",
    "handler": "https://fsi-handler-credit-memo-commercial-v4uibzu6ga-uc.a.run.app",
}

PUBSUB_TOPIC = "projects/agentic-experiments/topics/loans.application.submitted"


@pytest.fixture(scope="session")
def live_endpoints() -> dict[str, str]:
    """Return the map of service name -> Cloud Run URL for @live tests."""
    return LIVE_ENDPOINTS


@pytest.fixture(scope="session")
def pubsub_topic() -> str:
    """Return the Pub/Sub trigger topic path."""
    return PUBSUB_TOPIC
