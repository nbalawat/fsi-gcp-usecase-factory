"""Unit tests for exposure-aggregator."""
import pytest
from unittest.mock import MagicMock, patch
from main import (
    classify_concentration,
    compute_single_borrower_pct,
    process,
    validate_inputs,
)

# ── DB mock (autouse so no test touches Cloud SQL) ─────────────────────────

@pytest.fixture(autouse=True)
def mock_engine(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.__enter__ = lambda s: mock_conn
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchone.return_value = (5_000_000, 3_500_000)
    mock_eng = MagicMock()
    mock_eng.connect.return_value = mock_conn
    mock_eng.begin.return_value = mock_conn
    monkeypatch.setattr("main._engine", mock_eng)
    return mock_eng


@pytest.fixture
def thresholds():
    with patch("main._load_thresholds") as m:
        m.return_value = {
            "tier1_capital_dollars": 100_000_000.0,
            "occ_single_borrower_hard_limit_pct": 25.0,
            "single_borrower_watch_pct": 15.0,
            "single_borrower_elevated_pct": 10.0,
        }
        yield m


@pytest.fixture
def exposure_data():
    """Patch lookup_exposure to return controlled test data."""
    with patch("main.lookup_exposure") as m:
        m.return_value = (5_000_000.0, 3_500_000.0)
        yield m


VALID_PAYLOAD = {
    "context_id": "test-exp-001",
    "borrower_id": "DEMO-MFG-001",
    "as_of_date": "2026-05-06",
    "proposed_exposure": 1_000_000,
}

TIER1 = 100_000_000.0


# ── compute_single_borrower_pct ────────────────────────────────────────────

def test_single_borrower_pct_basic():
    # 3_500_000 / 100_000_000 * 100 = 3.5%
    pct = compute_single_borrower_pct(3_500_000, TIER1)
    assert pct == pytest.approx(3.5, rel=1e-5)


def test_single_borrower_pct_zero_outstanding():
    assert compute_single_borrower_pct(0, TIER1) == 0.0


def test_single_borrower_pct_zero_capital():
    assert compute_single_borrower_pct(1_000_000, 0) == 0.0


def test_single_borrower_pct_above_occ_limit():
    # 30M / 100M * 100 = 30%  → above OCC 25% hard limit
    pct = compute_single_borrower_pct(30_000_000, TIER1)
    assert pct == pytest.approx(30.0, rel=1e-5)


# ── classify_concentration ─────────────────────────────────────────────────

THRESHOLDS_DATA = {
    "occ_single_borrower_hard_limit_pct": 25.0,
    "single_borrower_watch_pct": 15.0,
    "single_borrower_elevated_pct": 10.0,
}


def test_classify_normal():
    band, breaches = classify_concentration(5.0, THRESHOLDS_DATA)
    assert band == "normal"
    assert breaches == []


def test_classify_elevated():
    band, breaches = classify_concentration(12.0, THRESHOLDS_DATA)
    assert band == "elevated"
    assert breaches == []


def test_classify_watch():
    band, breaches = classify_concentration(18.0, THRESHOLDS_DATA)
    assert band == "watch"
    assert breaches == []


def test_classify_critical_breach():
    band, breaches = classify_concentration(26.0, THRESHOLDS_DATA)
    assert band == "critical"
    assert len(breaches) == 1
    assert "OCC_SINGLE_BORROWER_LIMIT" in breaches[0]


def test_classify_exactly_at_occ_limit_is_critical():
    band, breaches = classify_concentration(25.0, THRESHOLDS_DATA)
    assert band == "critical"


# ── validate_inputs ────────────────────────────────────────────────────────

def test_validate_missing_borrower_id():
    with pytest.raises(ValueError, match="borrower_id"):
        validate_inputs({"as_of_date": "2026-05-06"})


def test_validate_missing_as_of_date():
    with pytest.raises(ValueError, match="as_of_date"):
        validate_inputs({"borrower_id": "DEMO-MFG-001"})


def test_validate_empty_borrower_id():
    with pytest.raises(ValueError, match="non-empty string"):
        validate_inputs({"borrower_id": "   ", "as_of_date": "2026-05-06"})


def test_validate_empty_as_of_date():
    with pytest.raises(ValueError, match="non-empty string"):
        validate_inputs({"borrower_id": "DEMO-MFG-001", "as_of_date": ""})


# ── process() integration ──────────────────────────────────────────────────

def test_process_output_structure(thresholds, exposure_data):
    result = process(VALID_PAYLOAD)
    for field in [
        "existing_exposure_committed", "existing_exposure_outstanding",
        "proposed_exposure", "total_exposure_with_proposed",
        "single_borrower_pct", "concentration_band",
        "threshold_breaches", "tier1_capital_used", "context_id",
    ]:
        assert field in result, f"Missing output field: {field}"


def test_process_includes_proposed_in_total(thresholds, exposure_data):
    # outstanding=3_500_000, proposed=1_000_000 → total=4_500_000
    result = process(VALID_PAYLOAD)
    assert result["total_exposure_with_proposed"] == 4_500_000.0


def test_process_pct_includes_proposed(thresholds, exposure_data):
    # total_with_proposed = 4_500_000 / 100_000_000 * 100 = 4.5%
    result = process(VALID_PAYLOAD)
    assert result["single_borrower_pct"] == pytest.approx(4.5, rel=1e-4)


def test_process_concentration_band_normal(thresholds, exposure_data):
    result = process(VALID_PAYLOAD)
    assert result["concentration_band"] == "normal"


def test_process_concentration_band_critical(thresholds):
    with patch("main.lookup_exposure") as m:
        m.return_value = (28_000_000.0, 25_000_000.0)
        result = process({**VALID_PAYLOAD, "proposed_exposure": 2_000_000})
    assert result["concentration_band"] == "critical"
    assert len(result["threshold_breaches"]) >= 1


def test_process_missing_borrower_id_raises(thresholds):
    with pytest.raises(ValueError, match="borrower_id"):
        process({"as_of_date": "2026-05-06"})


def test_process_missing_as_of_date_raises(thresholds):
    with pytest.raises(ValueError, match="as_of_date"):
        process({"borrower_id": "DEMO-MFG-001"})


def test_process_zero_proposed_exposure(thresholds):
    with patch("main.lookup_exposure") as m:
        m.return_value = (5_000_000.0, 3_500_000.0)
        result = process({**VALID_PAYLOAD, "proposed_exposure": 0})
    assert result["total_exposure_with_proposed"] == 3_500_000.0


# ── Mandatory audit and portable DB tests ─────────────────────────────────

def test_audit_write_called(mock_engine, thresholds, exposure_data):
    process(VALID_PAYLOAD)
    mock_engine.begin.assert_called()


def test_audit_write_on_validation_error(mock_engine):
    with pytest.raises(ValueError):
        process({"as_of_date": "2026-05-06"})
    mock_engine.begin.assert_called()


def test_threshold_loaded_from_db(thresholds, exposure_data):
    process(VALID_PAYLOAD)
    thresholds.assert_called_once()


def test_no_hardcoded_threshold():
    """Only module-level constants are policy thresholds; locals are runtime values."""
    import main as m
    import ast, inspect, textwrap
    src = inspect.getsource(m)
    tree = ast.parse(textwrap.dedent(src))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and any(
                    kw in target.id.upper()
                    for kw in ["THRESHOLD", "LIMIT", "CAPITAL", "MAX_RATE"]
                ):
                    pytest.fail(f"Hardcoded policy constant at module scope: {target.id}")


def test_portable_db_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+pg8000://user:pass@localhost/testdb")
    import main
    monkeypatch.setattr("main._engine", None)
    with patch("sqlalchemy.create_engine") as mock_create:
        mock_create.return_value = MagicMock()
        main._get_engine()
        mock_create.assert_called_once()
        assert "postgresql" in str(mock_create.call_args)
