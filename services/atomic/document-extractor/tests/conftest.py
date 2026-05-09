"""Shared test fixtures for document-extractor."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest


# Make sure pytest sees us in test mode (audit writes become no-op)
os.environ.setdefault("PYTEST_CURRENT_TEST", "1")
os.environ.setdefault("CI_SKIP_ASSERT_ENV", "1")
os.environ.setdefault("DOC_VENDOR", "stub")
os.environ.setdefault("DOCUMENT_SCHEMAS_DIR", str(
    Path(__file__).resolve().parent.parent.parent.parent.parent
    / "usecases" / "credit-memo-commercial" / "schemas"
))


@pytest.fixture
def fixtures_dir() -> Path:
    """Real-PDF + golden JSON fixtures directory."""
    return Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def golden_dir() -> Path:
    """Stub-vendor response fixtures."""
    return Path(__file__).resolve().parent / "golden"


@pytest.fixture
def sample_extract_request_10k() -> dict:
    """Minimal valid ExtractRequest for a 10-K."""
    return {
        "application_id": "11111111-1111-1111-1111-111111111111",
        "doc_id": "22222222-2222-2222-2222-222222222222",
        "doc_type": "10-K",
        "gcs_uri": "gs://test-bucket/applications/X/documents/Y.pdf",
    }


@pytest.fixture
def sample_extract_request_ar_aging() -> dict:
    return {
        "application_id": "11111111-1111-1111-1111-111111111111",
        "doc_id": "33333333-3333-3333-3333-333333333333",
        "doc_type": "AR_aging",
        "gcs_uri": "gs://test-bucket/applications/X/documents/Z.pdf",
    }


@pytest.fixture
def stub_extracted_lincoln_10k() -> dict:
    return {
        "fiscal_year_end": "2024-12-31",
        "currency": "USD",
        "units": "millions",
        "income_statement": {
            "revenue": 4233.0,
            "cogs": 2842.0,
            "ebitda": 804.0,
            "operating_income": 612.0,
            "depreciation_amortization": 192.0,
            "interest_expense": 34.0,
            "tax_expense": 134.0,
            "net_income": 444.0,
        },
        "balance_sheet": {
            "total_assets": 3892.0,
            "current_assets": 1812.0,
            "cash_and_equivalents": 412.0,
            "accounts_receivable": 624.0,
            "inventory": 488.0,
            "ppe_net": 712.0,
            "total_liabilities": 1923.0,
            "current_liabilities": 882.0,
            "total_debt": 720.0,
            "long_term_debt": 642.0,
            "short_term_debt": 78.0,
            "total_equity": 1969.0,
        },
        "cash_flow": {
            "operating_cash_flow": 712.0,
            "capex": 121.0,
            "free_cash_flow": 591.0,
        },
        "customer_concentration": {
            "disclosed": True,
            "top_1_pct": 0.08,
            "top_5_pct": 0.24,
            "named_customers": [],
        },
        "officers": [
            {"name": "Christopher L. Mapes", "title": "CEO", "tenure_years": 12.0},
            {"name": "Gabriel Bruno", "title": "CFO", "tenure_years": 4.0},
        ],
        "going_concern_qualification": False,
    }


@pytest.fixture(autouse=True)
def write_stub_fixtures_once(tmp_path_factory, golden_dir, stub_extracted_lincoln_10k):
    """Ensure stub fixture files exist so tests/test_*.py tests can run
    even on first checkout (real PDF fixtures will be added later)."""
    golden_dir.mkdir(parents=True, exist_ok=True)

    stub_10k_path = golden_dir / "10-K.stub.json"
    if not stub_10k_path.exists():
        stub_10k_path.write_text(json.dumps({
            "extracted_fields": stub_extracted_lincoln_10k,
            "confidence": 0.93,
            "page_count": 240,
            "citations": [
                {"field_path": "income_statement.revenue", "chunk_id": "ch_42", "page": 18,
                 "bbox": [0.1, 0.2, 0.6, 0.25], "excerpt": "Net sales totaled $4,233.0 million in 2024",
                 "confidence": 0.96}
            ],
        }, indent=2))

    stub_ar_path = golden_dir / "AR_aging.stub.json"
    if not stub_ar_path.exists():
        stub_ar_path.write_text(json.dumps({
            "extracted_fields": {
                "as_of_date": "2024-12-31",
                "total_ar": 624.0,
                "customers": [
                    {"name": "Customer A", "total": 142.0, "current": 138.0},
                    {"name": "Customer B", "total": 88.0, "current": 86.0},
                ],
            },
            "confidence": 0.91,
            "page_count": 14,
            "citations": [],
        }, indent=2))

    stub_deficient_path = golden_dir / "board_minutes.stub.json"
    if not stub_deficient_path.exists():
        stub_deficient_path.write_text(json.dumps({
            "extracted_fields": {
                "meeting_date": "2024-08-15",
                "directors_present": ["Director A", "Director B"]
            },
            "confidence": 0.88,
            "page_count": 12,
        }, indent=2))
