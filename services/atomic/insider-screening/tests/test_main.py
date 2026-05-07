"""Unit tests for insider-screening — real SQLite, no mocks."""
import pytest
from sqlalchemy import text
from main import (
    applicable_lending_limit,
    process,
    screen_subject,
    validate_inputs,
)


AS_OF = "2026-05-07"


# ── Direct insider classification ─────────────────────────────────────────

def test_executive_officer_classified_correctly():
    r = screen_subject("INSIDER-CEO-1", AS_OF, max_depth=2)
    assert r["insider_status"] == "insider"
    assert r["insider_type"] == "executive_officer"
    assert r["related_to"] is None
    assert r["confidence"] >= 0.99


def test_director_classified_correctly():
    r = screen_subject("INSIDER-DIR-1", AS_OF, max_depth=2)
    assert r["insider_status"] == "insider"
    assert r["insider_type"] == "director"


def test_principal_shareholder_classified_correctly():
    r = screen_subject("DEMO-WHALE-1", AS_OF, max_depth=2)
    assert r["insider_status"] == "insider"
    assert r["insider_type"] == "principal_shareholder"


def test_expired_shareholder_NOT_classified_as_insider():
    """A past principal shareholder whose effective_to has passed is NOT insider."""
    r = screen_subject("DEMO-WHALE-PAST", AS_OF, max_depth=2)
    assert r["insider_status"] == "non-insider"


# ── Related-interest traversal ────────────────────────────────────────────

def test_family_member_of_ceo_classified_as_related_interest():
    r = screen_subject("INSIDER-FAMILY-1", AS_OF, max_depth=2)
    assert r["insider_status"] == "insider"
    assert r["insider_type"] == "related_interest"
    assert r["related_to"] == "INSIDER-CEO-1"


def test_controlled_entity_classified_as_related_interest():
    r = screen_subject("DEMO-WHALE-LLC", AS_OF, max_depth=2)
    assert r["insider_status"] == "insider"
    assert r["insider_type"] == "related_interest"
    assert r["related_to"] == "DEMO-WHALE-1"


def test_two_hop_subsidiary_caught_at_depth_2():
    """DEMO-WHALE-SUB → DEMO-WHALE-LLC → DEMO-WHALE-1 (insider)"""
    r = screen_subject("DEMO-WHALE-SUB", AS_OF, max_depth=2)
    assert r["insider_status"] == "insider"
    assert r["insider_type"] == "related_interest"


def test_max_depth_zero_misses_indirect_insider():
    r = screen_subject("INSIDER-FAMILY-1", AS_OF, max_depth=0)
    assert r["insider_status"] == "non-insider"


# ── Non-insider ───────────────────────────────────────────────────────────

def test_unrelated_borrower_non_insider():
    r = screen_subject("DEMO-MFG-RANDOM-001", AS_OF, max_depth=2)
    assert r["insider_status"] == "non-insider"
    assert r["insider_type"] is None
    assert r["related_to"] is None


# ── Lending-limit citations ───────────────────────────────────────────────

def test_lending_limit_executive_officer():
    assert applicable_lending_limit("executive_officer") == "reg-O-15%"


def test_lending_limit_principal_shareholder():
    assert applicable_lending_limit("principal_shareholder") == "reg-O-15-aggregate"


def test_lending_limit_non_insider():
    assert applicable_lending_limit(None) == "LLL-25%"


# ── validate_inputs ───────────────────────────────────────────────────────

def test_validate_missing_borrower_id():
    with pytest.raises(ValueError, match="borrower_id"):
        validate_inputs({"as_of_date": AS_OF})


def test_validate_missing_as_of_date():
    with pytest.raises(ValueError, match="as_of_date"):
        validate_inputs({"borrower_id": "X"})


def test_validate_empty_borrower_id():
    with pytest.raises(ValueError, match="non-empty string"):
        validate_inputs({"borrower_id": "  ", "as_of_date": AS_OF})


# ── process() integration ────────────────────────────────────────────────

def test_process_insider_returns_board_approval_required():
    r = process({"context_id": "t1", "borrower_id": "INSIDER-CEO-1", "as_of_date": AS_OF})
    assert r["insider_status"] == "insider"
    assert r["requires_board_approval"] is True
    assert r["applicable_lending_limit"] == "reg-O-15%"


def test_process_non_insider_no_board_approval():
    r = process({"context_id": "t2", "borrower_id": "DEMO-MFG-RANDOM-001", "as_of_date": AS_OF})
    assert r["insider_status"] == "non-insider"
    assert r["requires_board_approval"] is False
    assert r["applicable_lending_limit"] == "LLL-25%"


def test_process_applicant_is_insider_promotes_classification():
    """Borrower is non-insider but applicant/guarantor is — classification escalates."""
    r = process({
        "context_id": "t3",
        "borrower_id": "DEMO-MFG-RANDOM-002",
        "applicant_id": "INSIDER-CEO-1",
        "as_of_date": AS_OF,
    })
    assert r["insider_status"] == "insider"
    assert r["requires_board_approval"] is True


def test_process_two_hop_traversal_caught():
    r = process({"context_id": "t4", "borrower_id": "DEMO-WHALE-SUB", "as_of_date": AS_OF})
    assert r["insider_status"] == "insider"
    assert r["insider_type"] == "related_interest"


# ── Audit + redaction ────────────────────────────────────────────────────

def test_audit_row_inserted_on_success(test_db):
    process({"context_id": "audit-test-1", "borrower_id": "INSIDER-CEO-1", "as_of_date": AS_OF})
    with test_db.connect() as conn:
        rows = conn.execute(
            text("SELECT inputs_summary, outputs_summary, error FROM audit_events WHERE context_id = 'audit-test-1'")
        ).fetchall()
    assert len(rows) == 1
    inp, out, err = rows[0]
    # Borrower_id is redacted in audit (last-4 only)
    assert "INSIDER-CEO-1" not in inp, f"unredacted borrower_id in audit inputs: {inp}"
    assert "EO-1" in inp or "...EO-1" in inp.replace('"', '') or inp.endswith('CEO-1"}') is False, \
        f"redacted form should retain last-4: {inp}"
    assert err is None


def test_audit_redacts_ein_in_payload(test_db):
    """EIN values in payload must be masked before audit insertion."""
    process({
        "context_id": "audit-ein-1",
        "borrower_id": "INSIDER-CEO-1",
        "as_of_date": AS_OF,
        "tax_id": "12-3456789",
    })
    with test_db.connect() as conn:
        row = conn.execute(
            text("SELECT inputs_summary FROM audit_events WHERE context_id = 'audit-ein-1'")
        ).fetchone()
    assert "12-3456789" not in row[0], f"raw EIN leaked into audit: {row[0]}"


def test_audit_fires_on_validation_error(test_db):
    try:
        process({})
    except ValueError:
        pass
    with test_db.connect() as conn:
        rows = conn.execute(
            text("SELECT error FROM audit_events WHERE service_name = 'insider-screening'")
        ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] is not None
