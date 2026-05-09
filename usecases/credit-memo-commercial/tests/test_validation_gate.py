"""Validation-gate tests.

Two layers:

  Layer A (deterministic — always green, no infra):
    Drive evaluate_application_completeness() with constructed
    ValidationInput objects. Asserts the decision logic for every
    branch in the spec — happy path, each failure mode, every loan-
    amount tier.

  Layer B (live — real Cloud SQL):
    Build a ValidationInput from real application_documents rows
    written by /api/applications, run the gate, write the resulting
    return_notice into application_artifacts. Verifies the full
    chain from upload → extraction → validation → return_notice.

Run:
  Layer A:  pytest usecases/credit-memo-commercial/tests/test_validation_gate.py -m "not live"
  Layer B:  LIVE_DB_TESTS=1 DB_PASS=... pytest usecases/credit-memo-commercial/tests/test_validation_gate.py -m live
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import uuid
from pathlib import Path
from typing import Any

import pytest

# Make the validation package importable
_UC_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_UC_ROOT))

from validation import (  # noqa: E402
    DocumentInput,
    MissingItem,
    ValidationDecision,
    ValidationInput,
    ValidationResult,
    evaluate_application_completeness,
)


# ============================================================================
# Layer A — deterministic tests
# ============================================================================


def _doc(
    doc_type: str,
    *,
    extracted: bool = True,
    missing: list[str] | None = None,
    error_code: str | None = None,
) -> DocumentInput:
    return DocumentInput(
        doc_id=str(uuid.uuid4()),
        doc_type=doc_type,  # type: ignore[arg-type]
        extraction_status="extracted" if extracted else "failed",
        missing_required_fields=missing or [],
        error_code=error_code,
    )


def _mk_input(
    *docs: DocumentInput,
    loan_amount: float = 5_000_000,
    has_real_estate: bool = False,
) -> ValidationInput:
    return ValidationInput(
        application_id=str(uuid.uuid4()),
        loan_amount_usd=loan_amount,
        has_real_estate_collateral=has_real_estate,
        documents=list(docs),
    )


# ── Happy paths per tier ────────────────────────────────────────────────────


class TestHappyPaths:
    def test_under_10m_with_just_a_clean_10k(self):
        result = evaluate_application_completeness(
            _mk_input(_doc("10-K"), loan_amount=5_000_000),
        )
        assert result.decision == "PROCEED", (
            f"Sub-$10M loan with a clean 10-K must proceed; "
            f"got {result.missing_items}"
        )
        assert result.missing_items == []

    def test_under_10m_with_audited_financials(self):
        result = evaluate_application_completeness(
            _mk_input(_doc("audited_financials"), loan_amount=5_000_000),
        )
        assert result.decision == "PROCEED"

    def test_25m_loan_with_10k_plus_ar_aging(self):
        result = evaluate_application_completeness(
            _mk_input(_doc("10-K"), _doc("AR_aging"), loan_amount=25_000_000),
        )
        assert result.decision == "PROCEED"

    def test_75m_loan_with_full_set(self):
        result = evaluate_application_completeness(
            _mk_input(
                _doc("10-K"),
                _doc("10-Q"),
                _doc("AR_aging"),
                loan_amount=75_000_000,
            ),
        )
        assert result.decision == "PROCEED"


# ── Tier-rule failures ──────────────────────────────────────────────────────


class TestTierRuleFailures:
    def test_25m_loan_missing_ar_aging(self):
        """$25M loan needs AR_aging per tier rule."""
        result = evaluate_application_completeness(
            _mk_input(_doc("10-K"), loan_amount=25_000_000),
        )
        assert result.decision == "RETURN_FOR_REVISION"
        codes = {item.code for item in result.missing_items}
        assert "missing_doc_type" in codes
        ar_aging_items = [
            i for i in result.missing_items
            if i.doc_type == "AR_aging" and i.code == "missing_doc_type"
        ]
        assert len(ar_aging_items) >= 1

    def test_75m_loan_missing_10q(self):
        result = evaluate_application_completeness(
            _mk_input(_doc("10-K"), _doc("AR_aging"), loan_amount=75_000_000),
        )
        assert result.decision == "RETURN_FOR_REVISION"
        types_missing = {i.doc_type for i in result.missing_items if i.code == "missing_doc_type"}
        assert "10-Q" in types_missing

    def test_300m_loan_missing_board_minutes(self):
        result = evaluate_application_completeness(
            _mk_input(
                _doc("10-K"),
                _doc("10-Q"),
                _doc("AR_aging"),
                loan_amount=300_000_000,
            ),
        )
        assert result.decision == "RETURN_FOR_REVISION"
        types_missing = {i.doc_type for i in result.missing_items if i.code == "missing_doc_type"}
        assert "board_minutes" in types_missing

    def test_zero_audited_financials_blocks_any_loan(self):
        """A $1M loan with only AR_aging — no annual financials at all.
        Must fail the minimum_always rule."""
        result = evaluate_application_completeness(
            _mk_input(_doc("AR_aging"), loan_amount=1_000_000),
        )
        assert result.decision == "RETURN_FOR_REVISION"
        # The minimum_always check should fire
        codes = {(i.code, i.regulation) for i in result.missing_items}
        assert any(c == "incomplete_application" for c, _ in codes)


# ── Critical-field failures ─────────────────────────────────────────────────


class TestCriticalFieldFailures:
    def test_10k_extracted_without_revenue(self):
        result = evaluate_application_completeness(
            _mk_input(
                _doc(
                    "10-K",
                    missing=["income_statement.revenue"],
                ),
                loan_amount=5_000_000,
            ),
        )
        assert result.decision == "RETURN_FOR_REVISION"
        critical = [i for i in result.missing_items if i.code == "critical_field_missing"]
        assert len(critical) == 1
        assert critical[0].field_path == "income_statement.revenue"
        assert critical[0].doc_type == "10-K"

    def test_10k_with_only_preferred_missing_proceeds(self):
        """Missing fields that aren't in the critical-keyword list shouldn't
        block — the analyst can work without customer_concentration.hhi."""
        result = evaluate_application_completeness(
            _mk_input(
                _doc(
                    "10-K",
                    missing=["customer_concentration.hhi"],  # preferred-ish
                ),
                loan_amount=5_000_000,
            ),
        )
        # If the only missing field is non-critical and doc set is otherwise fine,
        # we proceed. The critical-keyword filter is doing the work here.
        # NOTE: customer_concentration.hhi is NOT in the critical keyword list.
        assert result.decision == "PROCEED", (
            f"Non-critical missing fields shouldn't block; got {result.missing_items}"
        )

    def test_multiple_critical_fields_missing_all_reported(self):
        result = evaluate_application_completeness(
            _mk_input(
                _doc(
                    "10-K",
                    missing=[
                        "income_statement.revenue",
                        "balance_sheet.total_assets",
                        "cash_flow.operating_cash_flow",
                    ],
                ),
                loan_amount=5_000_000,
            ),
        )
        assert result.decision == "RETURN_FOR_REVISION"
        critical = [i for i in result.missing_items if i.code == "critical_field_missing"]
        assert len(critical) == 3
        paths = {i.field_path for i in critical}
        assert paths == {
            "income_statement.revenue",
            "balance_sheet.total_assets",
            "cash_flow.operating_cash_flow",
        }


# ── Extraction-failure handling ─────────────────────────────────────────────


class TestExtractionFailures:
    def test_failed_doc_blocks_application(self):
        result = evaluate_application_completeness(
            _mk_input(
                _doc("10-K", extracted=False, error_code="landing_ai_parse_http_422"),
                loan_amount=5_000_000,
            ),
        )
        assert result.decision == "RETURN_FOR_REVISION"
        failed_items = [i for i in result.missing_items if i.code == "extraction_failed"]
        assert len(failed_items) == 1
        assert "could not be processed" in failed_items[0].applicant_message

    def test_pending_doc_treated_as_failed_loud(self):
        """If the gate runs while a doc is still 'pending', that's a
        programming error — must fail loudly so we catch the race
        condition rather than silently letting the doc through."""
        d = DocumentInput(
            doc_id=str(uuid.uuid4()),
            doc_type="10-K",
            extraction_status="pending",
        )
        result = evaluate_application_completeness(
            _mk_input(d, loan_amount=5_000_000),
        )
        assert result.decision == "RETURN_FOR_REVISION"


# ── Real-estate collateral conditional ──────────────────────────────────────


class TestCollateralConditional:
    def test_real_estate_loan_without_appraisal_blocks(self):
        result = evaluate_application_completeness(
            _mk_input(
                _doc("10-K"),
                _doc("AR_aging"),
                loan_amount=25_000_000,
                has_real_estate=True,
            ),
        )
        assert result.decision == "RETURN_FOR_REVISION"
        appraisal_items = [
            i for i in result.missing_items
            if i.doc_type == "appraisal" and i.code == "missing_doc_type"
        ]
        assert len(appraisal_items) == 1
        assert appraisal_items[0].regulation == "12_CFR_34"

    def test_real_estate_loan_with_appraisal_proceeds(self):
        result = evaluate_application_completeness(
            _mk_input(
                _doc("10-K"),
                _doc("AR_aging"),
                _doc("appraisal"),
                loan_amount=25_000_000,
                has_real_estate=True,
            ),
        )
        assert result.decision == "PROCEED"


# ── Output shape ────────────────────────────────────────────────────────────


class TestOutputShape:
    def test_proceed_result_has_actionable_next_steps(self):
        result = evaluate_application_completeness(
            _mk_input(_doc("10-K"), loan_amount=5_000_000),
        )
        assert "underwriting" in result.next_steps.lower()

    def test_return_result_has_count_in_next_steps(self):
        result = evaluate_application_completeness(
            _mk_input(
                _doc("10-K", missing=["income_statement.revenue"]),
                loan_amount=5_000_000,
            ),
        )
        assert "1 item" in result.next_steps

    def test_submitted_doc_types_are_sorted_unique(self):
        result = evaluate_application_completeness(
            _mk_input(
                _doc("10-K"),
                _doc("AR_aging"),
                _doc("10-K"),  # duplicate doc_type
                loan_amount=25_000_000,
            ),
        )
        assert result.submitted_doc_types == ["10-K", "AR_aging"]

    def test_missing_items_are_deduplicated(self):
        """A field that fires multiple critical rules should appear once."""
        result = evaluate_application_completeness(
            _mk_input(
                _doc("10-K", missing=["income_statement.revenue"]),
                loan_amount=5_000_000,
            ),
        )
        # All items with the same (code, doc_type, field_path) are merged
        keys = [(i.code, i.doc_type, i.field_path) for i in result.missing_items]
        assert len(keys) == len(set(keys))


# ============================================================================
# Layer B — live DB integration
# ============================================================================


LIVE_ENABLED = os.environ.get("LIVE_DB_TESTS") == "1" and os.environ.get("DB_PASS")


UI_BASE_URL = os.environ.get("UI_BASE_URL", "http://localhost:3000")


@pytest.mark.live
@pytest.mark.skipif(
    not (LIVE_ENABLED and os.environ.get("LIVE_UI_TESTS") == "1"),
    reason="Requires LIVE_DB_TESTS + LIVE_UI_TESTS + running pnpm dev",
)
class TestPythonTsParity:
    """The TypeScript route /api/applications/<id>/validate is a port of
    the Python gate. They consume the same document_requirements.json,
    so they must agree on every input. This test inserts a few real
    application + document combinations into Cloud SQL, runs BOTH gates,
    and asserts they produce equivalent ValidationResults.

    If this test fails, the two gates have drifted — one has been changed
    without the other. Both must be brought back in lockstep before the
    underwriter UI and the workflow can ship."""

    @pytest.fixture(scope="class")
    def db_engine(self):
        import sqlalchemy
        user = os.environ.get("DB_USER", "fsi_app")
        pw = urllib.parse.quote_plus(os.environ["DB_PASS"])
        host = os.environ.get("DB_HOST", "127.0.0.1")
        port = os.environ.get("DB_PORT", "5432")
        name = os.environ.get("DB_NAME", "fsi_banking")
        url = f"postgresql+psycopg2://{user}:{pw}@{host}:{port}/{name}"
        return sqlalchemy.create_engine(url, future=True, pool_pre_ping=True)

    @pytest.mark.parametrize(
        "scenario",
        [
            # (loan_amount, [(doc_type, status, missing_fields, error_code)])
            (5_000_000, [("10-K", "extracted", [], None)]),  # PROCEED
            (
                5_000_000,
                [("10-K", "extracted", ["income_statement.revenue"], None)],
            ),  # critical_field_missing
            (25_000_000, [("10-K", "extracted", [], None)]),  # missing AR_aging
            (
                25_000_000,
                [
                    ("10-K", "failed", [], "landing_ai_parse_http_422"),
                    ("AR_aging", "extracted", [], None),
                ],
            ),  # extraction_failed
            (1_000_000, [("AR_aging", "extracted", [], None)]),  # baseline violation
        ],
    )
    def test_python_and_ts_gates_agree(self, db_engine, scenario):
        import requests
        import sqlalchemy
        from sqlalchemy import text

        loan_amount, docs_spec = scenario
        app_id = str(uuid.uuid4())

        try:
            # Seed
            with db_engine.begin() as c:
                c.execute(
                    text(
                        "INSERT INTO application_state (application_id, borrower_id, "
                        "borrower_name, loan_amount_usd, current_stage) "
                        "VALUES (:a, 'BRW-PARITY', 'Parity Test', :lamt, 'intake')"
                    ),
                    {"a": app_id, "lamt": loan_amount},
                )
                for i, (dtype, status, missing, errcode) in enumerate(docs_spec):
                    c.execute(
                        text(
                            "INSERT INTO application_documents "
                            "(doc_id, application_id, doc_type, original_filename, gcs_uri, "
                            "file_size_bytes, sha256_hex, extraction_status, "
                            "missing_required_fields, error_code) "
                            "VALUES (:d, :a, :dt, 'x.pdf', 'gs://t/x.pdf', 100, "
                            ":h, :s, CAST(:m AS jsonb), :ec)"
                        ),
                        {
                            "d": str(uuid.uuid4()),
                            "a": app_id,
                            "dt": dtype,
                            "h": f"{i:064d}",  # unique sha
                            "s": status,
                            "m": json.dumps(missing),
                            "ec": errcode,
                        },
                    )

            # Python gate
            with db_engine.connect() as c:
                rows = c.execute(
                    text(
                        "SELECT doc_id, doc_type, extraction_status, "
                        "COALESCE(missing_required_fields, '[]'::jsonb) AS m, error_code "
                        "FROM application_documents WHERE application_id = :a"
                    ),
                    {"a": app_id},
                ).fetchall()

            documents = [
                DocumentInput(
                    doc_id=str(r[0]),
                    doc_type=r[1],
                    extraction_status=r[2],
                    missing_required_fields=list(r[3]) if r[3] else [],
                    error_code=r[4],
                )
                for r in rows
            ]
            py_result = evaluate_application_completeness(
                ValidationInput(
                    application_id=app_id,
                    loan_amount_usd=loan_amount,
                    documents=documents,
                )
            )

            # TS gate via the route
            r = requests.get(
                f"{UI_BASE_URL}/api/applications/{app_id}/validate", timeout=10,
            )
            assert r.status_code == 200, f"TS gate failed: {r.status_code} {r.text}"
            ts_result = r.json()["validation"]

            # Compare — decision must match exactly
            assert py_result.decision == ts_result["decision"], (
                f"Gates disagree on decision for loan_amount={loan_amount} docs={docs_spec}:\n"
                f"  Python: {py_result.decision}\n"
                f"  TS    : {ts_result['decision']}\n"
                f"  Python items: {[i.code for i in py_result.missing_items]}\n"
                f"  TS items    : {[i['code'] for i in ts_result['missing_items']]}"
            )

            # Same set of missing-item codes
            py_codes = sorted(
                (i.code, i.doc_type, i.field_path) for i in py_result.missing_items
            )
            ts_codes = sorted(
                (i["code"], i["doc_type"], i["field_path"]) for i in ts_result["missing_items"]
            )
            assert py_codes == ts_codes, (
                f"Gates disagree on missing-item codes:\n"
                f"  Python: {py_codes}\n"
                f"  TS    : {ts_codes}"
            )

            # submitted_doc_types match
            assert py_result.submitted_doc_types == ts_result["submitted_doc_types"]

        finally:
            with db_engine.begin() as c:
                c.execute(text("DELETE FROM application_documents WHERE application_id = :a"), {"a": app_id})
                c.execute(text("DELETE FROM application_state WHERE application_id = :a"), {"a": app_id})


@pytest.mark.live
@pytest.mark.skipif(not LIVE_ENABLED, reason="Set LIVE_DB_TESTS=1 + DB_PASS to run live DB tests")
class TestLiveValidationFlow:
    """Round-trip a real application through the gate and into a
    return_notice artifact. Reads from application_documents, writes to
    application_artifacts."""

    @pytest.fixture(scope="class")
    def db_engine(self):
        import sqlalchemy
        user = os.environ.get("DB_USER", "fsi_app")
        pw = urllib.parse.quote_plus(os.environ["DB_PASS"])
        host = os.environ.get("DB_HOST", "127.0.0.1")
        port = os.environ.get("DB_PORT", "5432")
        name = os.environ.get("DB_NAME", "fsi_banking")
        url = f"postgresql+psycopg2://{user}:{pw}@{host}:{port}/{name}"
        return sqlalchemy.create_engine(url, future=True, pool_pre_ping=True)

    def test_load_real_documents_run_gate_persist_return_notice(self, db_engine):
        """Insert: app + 1 doc with extraction_status=failed.
        Run the gate → expect RETURN_FOR_REVISION.
        Persist as application_artifacts(artifact_type='return_notice').
        Read back + verify shape."""
        import sqlalchemy
        from sqlalchemy import text

        app_id = str(uuid.uuid4())
        doc_id = str(uuid.uuid4())

        try:
            # Seed test rows
            with db_engine.begin() as c:
                c.execute(
                    text(
                        "INSERT INTO application_state (application_id, borrower_id, "
                        "borrower_name, loan_amount_usd, current_stage) "
                        "VALUES (:a, 'BRW-VALIDATION-TEST', 'Validation Gate Test', 25000000, 'intake')"
                    ),
                    {"a": app_id},
                )
                c.execute(
                    text(
                        "INSERT INTO application_documents "
                        "(doc_id, application_id, doc_type, original_filename, gcs_uri, "
                        "file_size_bytes, sha256_hex, extraction_status, error_code) "
                        "VALUES (:d, :a, '10-K', 'test.pdf', 'gs://test/x.pdf', 1024, "
                        ":h, 'failed', 'landing_ai_parse_http_422')"
                    ),
                    {"d": doc_id, "a": app_id, "h": "x" * 64},
                )

            # Read documents → build ValidationInput
            with db_engine.connect() as c:
                rows = c.execute(
                    text(
                        "SELECT doc_id, doc_type, extraction_status, "
                        "COALESCE(missing_required_fields, '[]'::jsonb) AS m, error_code "
                        "FROM application_documents WHERE application_id = :a"
                    ),
                    {"a": app_id},
                ).fetchall()

            documents = [
                DocumentInput(
                    doc_id=str(row[0]),
                    doc_type=row[1],
                    extraction_status=row[2],
                    missing_required_fields=list(row[3]) if row[3] else [],
                    error_code=row[4],
                )
                for row in rows
            ]
            inp = ValidationInput(
                application_id=app_id,
                loan_amount_usd=25_000_000,
                documents=documents,
            )

            # Run gate
            result = evaluate_application_completeness(inp)

            assert result.decision == "RETURN_FOR_REVISION", (
                f"Failed-extraction doc should produce RETURN_FOR_REVISION; "
                f"got {result}"
            )
            # We expect AT LEAST: extraction_failed + missing AR_aging
            codes = {i.code for i in result.missing_items}
            assert "extraction_failed" in codes
            assert "missing_doc_type" in codes  # AR_aging missing for $25M loan

            # Persist as return_notice artifact
            with db_engine.begin() as c:
                c.execute(
                    text(
                        "INSERT INTO application_artifacts "
                        "(application_id, artifact_type, revision_number, author, body) "
                        "VALUES (:a, 'return_notice', 1, 'system', CAST(:body AS jsonb))"
                    ),
                    {"a": app_id, "body": result.model_dump_json()},
                )
                c.execute(
                    text(
                        "UPDATE application_state SET decision = 'RETURN_FOR_REVISION' "
                        "WHERE application_id = :a"
                    ),
                    {"a": app_id},
                )

            # Read back + verify
            with db_engine.connect() as c:
                row = c.execute(
                    text(
                        "SELECT body FROM application_artifacts "
                        "WHERE application_id = :a AND artifact_type = 'return_notice'"
                    ),
                    {"a": app_id},
                ).first()
            assert row is not None
            persisted = row[0]
            assert persisted["decision"] == "RETURN_FOR_REVISION"
            assert len(persisted["missing_items"]) >= 2
            assert any(
                m["code"] == "extraction_failed"
                for m in persisted["missing_items"]
            )

            print(
                f"\n[live] Validation gate end-to-end: "
                f"failed-doc → RETURN_FOR_REVISION → return_notice artifact "
                f"with {len(persisted['missing_items'])} items"
            )

        finally:
            with db_engine.begin() as c:
                c.execute(text("DELETE FROM application_artifacts WHERE application_id = :a"), {"a": app_id})
                c.execute(text("DELETE FROM application_documents WHERE application_id = :a"), {"a": app_id})
                c.execute(text("DELETE FROM application_state WHERE application_id = :a"), {"a": app_id})
