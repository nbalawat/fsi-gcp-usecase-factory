"""Unit tests for covenant-analyzer."""
import pytest
from unittest.mock import MagicMock, patch
import main as svc
from main import (
    _compute_headroom,
    _determine_status,
    _extract_actual,
    check_covenant,
    process,
    project_covenant,
)

# ── DB mock (autouse so no test touches Cloud SQL) ─────────────────────────

@pytest.fixture(autouse=True)
def mock_engine(monkeypatch):
    mock_conn = MagicMock()
    mock_conn.__enter__ = lambda s: mock_conn
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchall.return_value = []
    mock_eng = MagicMock()
    mock_eng.connect.return_value = mock_conn
    mock_eng.begin.return_value = mock_conn
    monkeypatch.setattr("main._engine", mock_eng)
    return mock_eng


@pytest.fixture
def thresholds():
    with patch("main._load_thresholds") as m:
        m.return_value = {"warn_headroom_pct": 5.0}
        yield m


# ── Shared fixtures ────────────────────────────────────────────────────────

SPREAD_FINANCIALS_HEALTHY = {
    "dscr": 1.45,
    "leverage_ratio": 3.2,
    "current_ratio": 1.80,
    "interest_coverage": 4.5,
    "debt_to_equity": 0.65,
}

SPREAD_FINANCIALS_DISTRESSED = {
    "dscr": 1.10,
    "leverage_ratio": 5.1,
    "current_ratio": 1.05,
    "interest_coverage": 2.8,
    "debt_to_equity": 0.55,
}

SPREAD_FINANCIALS_BORDERLINE = {
    "dscr": 1.265,         # threshold 1.25 → headroom ~1.2% (warn zone)
    "leverage_ratio": 4.28,  # threshold 4.50 → headroom ~4.9% (warn zone)
    "current_ratio": 1.35,
    "interest_coverage": 3.5,
    "debt_to_equity": 0.60,
}

COVENANT_DSCR = {"covenant_type": "dscr_minimum", "threshold": 1.25}
COVENANT_LEVERAGE = {"covenant_type": "leverage_maximum", "threshold": 4.5}
COVENANT_CURRENT = {"covenant_type": "current_ratio_minimum", "threshold": 1.20}
COVENANT_INTEREST = {"covenant_type": "interest_coverage_minimum", "threshold": 3.0}
COVENANT_DE = {"covenant_type": "debt_to_equity_maximum", "threshold": 2.0}

TRAILING_QUARTERS_IMPROVING = [
    {"dscr": 1.20, "leverage_ratio": 3.5, "current_ratio": 1.60, "interest_coverage": 3.8, "debt_to_equity": 0.70},
    {"dscr": 1.28, "leverage_ratio": 3.4, "current_ratio": 1.65, "interest_coverage": 3.9, "debt_to_equity": 0.68},
    {"dscr": 1.35, "leverage_ratio": 3.3, "current_ratio": 1.72, "interest_coverage": 4.1, "debt_to_equity": 0.67},
    {"dscr": 1.45, "leverage_ratio": 3.2, "current_ratio": 1.80, "interest_coverage": 4.5, "debt_to_equity": 0.65},
]

TRAILING_QUARTERS_DECLINING_DSCR = [
    {"dscr": 1.60, "leverage_ratio": 3.0},
    {"dscr": 1.50, "leverage_ratio": 3.1},
    {"dscr": 1.40, "leverage_ratio": 3.2},
    {"dscr": 1.30, "leverage_ratio": 3.3},
]

MINIMAL_PAYLOAD = {
    "context_id": "test-cov-001",
    "borrower_id": "DEMO-CORP-007",
    "proposed_covenants": [COVENANT_DSCR, COVENANT_LEVERAGE],
    "spread_financials": SPREAD_FINANCIALS_HEALTHY,
    "trailing_quarters": TRAILING_QUARTERS_IMPROVING,
}

WARN_PCT = 5.0


# ── All covenant types pass ────────────────────────────────────────────────

def test_all_covenant_types_pass():
    covenants = [COVENANT_DSCR, COVENANT_LEVERAGE, COVENANT_CURRENT, COVENANT_INTEREST, COVENANT_DE]
    for cov in covenants:
        result = check_covenant(cov, SPREAD_FINANCIALS_HEALTHY, WARN_PCT)
        assert result["status"] == "pass", f"{cov['covenant_type']} expected pass, got {result['status']}"


# ── DSCR covenant fails ────────────────────────────────────────────────────

def test_dscr_covenant_fails():
    result = check_covenant(COVENANT_DSCR, SPREAD_FINANCIALS_DISTRESSED, WARN_PCT)
    assert result["status"] == "fail"
    assert result["actual"] == 1.10
    assert result["headroom_pct"] < 0


# ── Leverage covenant fails ────────────────────────────────────────────────

def test_leverage_covenant_fails():
    result = check_covenant(COVENANT_LEVERAGE, SPREAD_FINANCIALS_DISTRESSED, WARN_PCT)
    assert result["status"] == "fail"
    assert result["headroom_pct"] < 0


# ── Borderline warn zone ───────────────────────────────────────────────────

def test_leverage_borderline_warn():
    result = check_covenant(COVENANT_LEVERAGE, SPREAD_FINANCIALS_BORDERLINE, WARN_PCT)
    assert result["status"] == "warn"
    assert 0 < result["headroom_pct"] <= WARN_PCT


def test_dscr_borderline_warn():
    result = check_covenant(COVENANT_DSCR, SPREAD_FINANCIALS_BORDERLINE, WARN_PCT)
    assert result["status"] == "warn"
    assert 0 < result["headroom_pct"] <= WARN_PCT


# ── Projection tests ───────────────────────────────────────────────────────

def test_dscr_passes_today_breaches_in_q3():
    result = project_covenant(COVENANT_DSCR, TRAILING_QUARTERS_DECLINING_DSCR)
    assert result["violations_projected"] is True
    assert result["first_breach_quarter"] is not None


def test_stable_dscr_no_projected_breach():
    result = project_covenant(COVENANT_DSCR, TRAILING_QUARTERS_IMPROVING)
    assert result["violations_projected"] is False
    assert result["first_breach_quarter"] is None


def test_projection_four_quarters_returned():
    result = project_covenant(COVENANT_DSCR, TRAILING_QUARTERS_IMPROVING)
    assert len(result["projected_values"]) == 4


def test_projection_trend_calculation():
    quarters = [{"dscr": 1.20}, {"dscr": 1.30}, {"dscr": 1.40}, {"dscr": 1.50}]
    result = project_covenant(COVENANT_DSCR, quarters)
    assert result["projected_values"][0] == pytest.approx(1.60, abs=0.001)
    assert result["projected_values"][3] == pytest.approx(1.90, abs=0.001)


def test_projection_flat_when_single_quarter():
    quarters = [{"dscr": 1.40}]
    result = project_covenant(COVENANT_DSCR, quarters)
    for v in result["projected_values"]:
        assert v == pytest.approx(1.40, abs=0.001)


# ── Mixed pass/fail ────────────────────────────────────────────────────────

def test_mixed_pass_fail():
    results = {
        r["covenant_type"]: r
        for r in [
            check_covenant(COVENANT_DSCR, SPREAD_FINANCIALS_DISTRESSED, WARN_PCT),
            check_covenant(COVENANT_LEVERAGE, SPREAD_FINANCIALS_DISTRESSED, WARN_PCT),
            check_covenant(COVENANT_DE, SPREAD_FINANCIALS_DISTRESSED, WARN_PCT),
        ]
    }
    assert results["dscr_minimum"]["status"] == "fail"
    assert results["leverage_maximum"]["status"] == "fail"
    assert results["debt_to_equity_maximum"]["status"] == "pass"


# ── Unknown type raises ────────────────────────────────────────────────────

def test_unknown_covenant_type_raises():
    bad_covenant = {"covenant_type": "mystery_ratio", "threshold": 1.0}
    with pytest.raises(ValueError, match="unknown covenant_type"):
        check_covenant(bad_covenant, SPREAD_FINANCIALS_HEALTHY, WARN_PCT)


# ── Missing ratio raises ───────────────────────────────────────────────────

def test_missing_ratio_raises():
    incomplete = {"leverage_ratio": 3.0}
    with pytest.raises(ValueError, match="dscr"):
        check_covenant(COVENANT_DSCR, incomplete, WARN_PCT)


# ── Empty covenants list ───────────────────────────────────────────────────

def test_empty_covenants_list(thresholds):
    payload = {
        "proposed_covenants": [],
        "spread_financials": SPREAD_FINANCIALS_HEALTHY,
        "trailing_quarters": TRAILING_QUARTERS_IMPROVING,
    }
    result = process(payload)
    assert result["covenant_test_results"] == []
    assert result["headroom_pct"] == {}
    assert result["violations_projected"] == []


# ── Headroom accuracy ──────────────────────────────────────────────────────

def test_headroom_minimum_covenant_positive():
    hp = _compute_headroom("dscr_minimum", threshold=1.25, actual=1.45)
    assert abs(hp - 16.0) < 0.01


def test_headroom_minimum_covenant_negative():
    hp = _compute_headroom("dscr_minimum", threshold=1.25, actual=1.10)
    assert abs(hp - (-12.0)) < 0.01


def test_headroom_maximum_covenant_positive():
    hp = _compute_headroom("leverage_maximum", threshold=4.5, actual=3.2)
    assert abs(hp - (1.3 / 4.5 * 100)) < 0.01


def test_headroom_maximum_covenant_negative():
    hp = _compute_headroom("leverage_maximum", threshold=4.5, actual=5.1)
    assert hp < 0


def test_headroom_zero_threshold():
    hp = _compute_headroom("dscr_minimum", threshold=0.0, actual=1.5)
    assert hp == 0.0


# ── determine_status takes warn_threshold_pct from Cloud SQL ──────────────

def test_determine_status_respects_custom_warn_pct():
    assert _determine_status(3.0, warn_threshold_pct=5.0) == "warn"
    assert _determine_status(3.0, warn_threshold_pct=2.0) == "pass"
    assert _determine_status(-1.0, warn_threshold_pct=5.0) == "fail"


# ── process() integration ──────────────────────────────────────────────────

def test_process_happy_path(thresholds):
    result = process(MINIMAL_PAYLOAD)
    assert "covenant_test_results" in result
    assert "headroom_pct" in result
    assert "violations_projected" in result
    assert result["context_id"] == "test-cov-001"
    assert len(result["covenant_test_results"]) == 2


def test_process_headroom_dict_keys_match(thresholds):
    result = process(MINIMAL_PAYLOAD)
    for cov in MINIMAL_PAYLOAD["proposed_covenants"]:
        assert cov["covenant_type"] in result["headroom_pct"]


def test_process_missing_covenant_type_raises(thresholds):
    payload = {
        "proposed_covenants": [{"threshold": 1.25}],
        "spread_financials": SPREAD_FINANCIALS_HEALTHY,
        "trailing_quarters": [],
    }
    with pytest.raises(ValueError, match="covenant_type"):
        process(payload)


# ── Nested spread_financials support ──────────────────────────────────────

def test_nested_ratios_dict():
    nested = {"ratios": {"dscr": 1.50, "leverage_ratio": 3.0}}
    result = check_covenant(COVENANT_DSCR, nested, WARN_PCT)
    assert result["actual"] == 1.50
    assert result["status"] == "pass"


# ── Leverage projection breach ─────────────────────────────────────────────

def test_leverage_projected_breach():
    quarters = [
        {"leverage_ratio": 3.0},
        {"leverage_ratio": 3.4},
        {"leverage_ratio": 3.8},
        {"leverage_ratio": 4.2},
    ]
    result = project_covenant(COVENANT_LEVERAGE, quarters)
    assert result["violations_projected"] is True
    assert result["first_breach_quarter"] == 1


# ── Mandatory audit and portable DB tests ─────────────────────────────────

def test_audit_write_called(mock_engine, thresholds):
    process(MINIMAL_PAYLOAD)
    mock_engine.begin.assert_called()


def test_audit_write_on_validation_error(mock_engine):
    with pytest.raises(ValueError):
        process({"proposed_covenants": "bad", "spread_financials": {}, "trailing_quarters": []})
    mock_engine.begin.assert_called()


def test_threshold_loaded_from_db(thresholds):
    process(MINIMAL_PAYLOAD)
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
                    for kw in ["THRESHOLD", "WARN_THRESHOLD", "LIMIT", "MAX_RATE", "MIN_DSCR"]
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
