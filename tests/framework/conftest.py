"""Shared pytest configuration for framework tests."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


# Make the harness package importable from any test file.
sys.path.insert(0, str(Path(__file__).parent))


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "llm: tests that invoke a real Claude agent via the Anthropic API; "
        "requires ANTHROPIC_API_KEY; gated by RUN_LLM_TESTS=1.",
    )


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    """Skip LLM-marked tests unless RUN_LLM_TESTS=1 or `-m llm` was given."""
    run_llm = os.environ.get("RUN_LLM_TESTS") == "1"
    explicit_llm = "llm" in (config.getoption("-m") or "")
    if run_llm or explicit_llm:
        return
    skip_marker = pytest.mark.skip(reason="LLM test (set RUN_LLM_TESTS=1 to run)")
    for item in items:
        if "llm" in item.keywords:
            item.add_marker(skip_marker)


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def fixtures_root() -> Path:
    return Path(__file__).parent / "gatekeepers" / "fixtures"
