"""Unit tests for dscr-calculator — pure function tests, Cloud SQL mocked."""
from __future__ import annotations

import ast
import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import main as svc
from main import (
    _annual_debt_service,
    _write_audit,
    apply_scenario,
    compute_dscr,
    process,
    validate_inputs,
)

# ── SQLAlchemy mock fixture ────────────────────────────────────────────────────


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


# ── Fixtures ───────────────────────────────────────────────────────────────────

INCOME_STMT = {
    "revenue": 50_000_000,
    "ebitda": 9_000_000,
    "capex": -1_500_000,
}

LOAN_TERMS = {
    "loan_amount": 25_000_000,
    "annual_principal_payment": 2_500_000,
    "annual_interest_payment": 1_125_000,
    "interest_rate": 0.045,
    "term_years": 10,
}

BASE_SCENARIO = {"name": "mild_stress", "revenue_shock": 0.90}
RATE_SHOCK_SCENARIO = {"name": "rate_shock", "rate_shock_bps": 200}

VALID_PAYLOAD = {
    "context_id": "test-dscr-001",
    "borrower_id": "DEMO-MFG-042",
    "period": "2025",
    "spread_income_statement": INCOME_STMT,
    "loan_terms": LOAN_TERMS,
    "scenarios": [BASE_SCENARIO, RATE_SHOCK_SCENARIO],
}

DSCR_PASS_THRESHOLD = 1.25  # local reference for test assertions only


# ── compute_dscr ───────────────────────────────────────────────────────────────

def test_compute_dscr_happy_path():
    result = compute_dscr(ebitda=9_000_000, capex=-1_500_000, annual_debt_service=3_625_000)
    expected = round(7_500_000 / 3_625_000, 4)
    assert result == expected
    assert result is not None and result > DSCR_PASS_THRESHOLD


def test_compute_dscr_exactly_at_threshold():
    ads = 4_000_000
    noi = ads * 1.25
    result = compute_dscr(ebitda=noi, capex=0, annual_debt_service=ads)
    assert result == 1.25


def test_compute_dscr_below_one_distressed():
    result = compute_dscr(ebitda=2_000_000, capex=-500_000, annual_debt_service=3_000_000)
    assert result == round(1_500_000 / 3_000_000, 4)
    assert result is not None and result < 1.0


def test_compute_dscr_zero_debt_service_returns_none():
    result = compute_dscr(ebitda=5_000_000, capex=0, annual_debt_service=0)
    assert result is None


def test_compute_dscr_positive_capex_sign_normalised():
    result_neg = compute_dscr(ebitda=10_000_000, capex=-2_000_000, annual_debt_service=4_000_000)
    result_pos = compute_dscr(ebitda=10_000_000, capex=2_000_000, annual_debt_service=4_000_000)
    assert result_neg == result_pos


def test_compute_dscr_large_enterprise():
    result = compute_dscr(
        ebitda=800_000_000,
        capex=-120_000_000,
        annual_debt_service=260_000_000,
    )
    expected = round(680_000_000 / 260_000_000, 4)
    assert result == expected
    assert result is not None and result > DSCR_PASS_THRESHOLD


# ── apply_scenario ─────────────────────────────────────────────────────────────

def test_apply_scenario_revenue_shock():
    scenario = {"name": "rev_down_15", "revenue_shock": 0.85}
    stressed = apply_scenario(INCOME_STMT, scenario)
    assert stressed["revenue"] == round(50_000_000 * 0.85, 2)
    expected_ebitda = round(50_000_000 * 0.85 * (9_000_000 / 50_000_000), 2)
    assert stressed["ebitda"] == expected_ebitda


def test_apply_scenario_margin_compression():
    scenario = {"name": "margin_squeeze", "ebitda_margin_delta": -0.05}
    stressed = apply_scenario(INCOME_STMT, scenario)
    assert stressed["revenue"] == 50_000_000
    expected_ebitda = round(50_000_000 * 0.13, 2)
    assert stressed["ebitda"] == expected_ebitda


def test_apply_scenario_capex_multiplier():
    scenario = {"name": "high_capex", "capex_multiplier": 1.50}
    stressed = apply_scenario(INCOME_STMT, scenario)
    assert stressed["capex"] == round(-1_500_000 * 1.50, 2)


def test_apply_scenario_name_propagated():
    scenario = {"name": "test_scenario", "revenue_shock": 0.90}
    stressed = apply_scenario(INCOME_STMT, scenario)
    assert stressed["_scenario_name"] == "test_scenario"


def test_apply_scenario_no_ops_passthrough():
    scenario = {"name": "no_op"}
    stressed = apply_scenario(INCOME_STMT, scenario)
    assert stressed["revenue"] == INCOME_STMT["revenue"]
    assert stressed["ebitda"] == INCOME_STMT["ebitda"]


# ── _annual_debt_service ───────────────────────────────────────────────────────

def test_ads_explicit_field():
    lt = {"annual_debt_service": 5_000_000}
    assert _annual_debt_service(lt) == 5_000_000


def test_ads_derived_from_components():
    lt = {"annual_principal_payment": 2_500_000, "annual_interest_payment": 1_000_000}
    assert _annual_debt_service(lt) == 3_500_000


def test_ads_derived_from_loan_amount_and_rate():
    lt = {"loan_amount": 20_000_000, "interest_rate": 0.05, "term_years": 10}
    assert _annual_debt_service(lt) == 3_000_000


# ── validate_inputs ────────────────────────────────────────────────────────────

def test_validate_missing_spread_income_statement():
    with pytest.raises(ValueError, match="spread_income_statement"):
        validate_inputs({"loan_terms": LOAN_TERMS, "scenarios": []})


def test_validate_missing_loan_terms():
    with pytest.raises(ValueError, match="loan_terms"):
        validate_inputs({"spread_income_statement": INCOME_STMT, "scenarios": []})


def test_validate_missing_scenarios():
    with pytest.raises(ValueError, match="scenarios"):
        validate_inputs({"spread_income_statement": INCOME_STMT, "loan_terms": LOAN_TERMS})


def test_validate_income_statement_not_dict():
    with pytest.raises(ValueError, match="spread_income_statement must be an object"):
        validate_inputs({
            "spread_income_statement": "bad",
            "loan_terms": LOAN_TERMS,
            "scenarios": [],
        })


def test_validate_scenarios_not_list():
    with pytest.raises(ValueError, match="scenarios must be a list"):
        validate_inputs({
            "spread_income_statement": INCOME_STMT,
            "loan_terms": LOAN_TERMS,
            "scenarios": "not_a_list",
        })


def test_validate_missing_ebitda_in_income_stmt():
    with pytest.raises(ValueError, match="ebitda"):
        validate_inputs({
            "spread_income_statement": {"revenue": 1_000_000},
            "loan_terms": LOAN_TERMS,
            "scenarios": [],
        })


# ── process() — with engine mocked ────────────────────────────────────────────

def test_process_happy_path_structure():
    result = process(VALID_PAYLOAD)
    assert "dscr_base" in result
    assert "dscr_stressed" in result
    assert "min_dscr_breach" in result
    assert "context_id" in result


def test_process_dscr_base_value():
    result = process(VALID_PAYLOAD)
    expected = round(7_500_000 / 3_625_000, 4)
    assert result["dscr_base"] == expected


def test_process_no_breach_healthy_borrower():
    result = process(VALID_PAYLOAD)
    assert result["min_dscr_breach"] is False


def test_process_breach_when_stressed_but_not_base():
    marginal_income = {"revenue": 30_000_000, "ebitda": 5_400_000, "capex": -500_000}
    marginal_loan = {"annual_principal_payment": 2_800_000, "annual_interest_payment": 1_000_000}
    severe_scenario = [{"name": "severe", "revenue_shock": 0.80, "ebitda_margin_delta": -0.02}]
    payload = {
        "spread_income_statement": marginal_income,
        "loan_terms": marginal_loan,
        "scenarios": severe_scenario,
        "context_id": "breach-test",
    }
    result = process(payload)
    base_dscr = result["dscr_base"]
    stressed_dscr = result["dscr_stressed"]["severe"]
    assert base_dscr is not None and base_dscr >= DSCR_PASS_THRESHOLD
    assert stressed_dscr is not None and stressed_dscr < DSCR_PASS_THRESHOLD
    assert result["min_dscr_breach"] is True


def test_process_multiple_scenarios_correct_minimum():
    scenarios = [
        {"name": "mild", "revenue_shock": 0.95},
        {"name": "moderate", "revenue_shock": 0.85},
        {"name": "severe", "revenue_shock": 0.70},
    ]
    payload = {**VALID_PAYLOAD, "scenarios": scenarios}
    result = process(payload)
    stressed = result["dscr_stressed"]
    assert stressed["severe"] < stressed["moderate"] < stressed["mild"]
    assert result["min_dscr"] == stressed["severe"]


def test_process_zero_scenarios_list():
    distressed = {
        "spread_income_statement": {"revenue": 10_000_000, "ebitda": 1_000_000, "capex": 0},
        "loan_terms": {"annual_principal_payment": 1_500_000, "annual_interest_payment": 500_000},
        "scenarios": [],
    }
    result = process(distressed)
    assert result["dscr_stressed"] == {}
    assert result["min_dscr_breach"] is True


def test_process_zero_debt_service_base_dscr_none():
    payload = {
        "spread_income_statement": {"revenue": 5_000_000, "ebitda": 2_000_000, "capex": 0},
        "loan_terms": {"annual_debt_service": 0},
        "scenarios": [],
    }
    result = process(payload)
    assert result["dscr_base"] is None
    assert result["min_dscr_breach"] is False


def test_process_context_and_borrower_passthrough():
    result = process(VALID_PAYLOAD)
    assert result["context_id"] == "test-dscr-001"
    assert result["borrower_id"] == "DEMO-MFG-042"


def test_process_missing_all_fields():
    with pytest.raises(ValueError):
        process({})


# ── Mandatory new tests ────────────────────────────────────────────────────────

def test_no_hardcoded_threshold():
    """
    AST check: no module-level (top-of-file) assignment of a numeric constant
    whose name indicates a policy threshold (e.g. DSCR_PASS_THRESHOLD) exists
    in main.py. Thresholds must come from Cloud SQL, not source code.
    """
    source = (Path(__file__).parent.parent / "main.py").read_text()
    tree = ast.parse(source)
    # Only inspect top-level statements (direct children of the Module body)
    forbidden_patterns = {"DSCR_PASS_THRESHOLD", "PASS_THRESHOLD", "STRESS_MULTIPLIER"}
    violations = []
    for node in tree.body:  # module-level only
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in forbidden_patterns:
                    violations.append(target.id)
    assert violations == [], (
        f"Hardcoded threshold constant(s) found at module level in main.py: {violations}. "
        "Move them to Cloud SQL threshold table."
    )


def test_audit_write_called():
    """_write_audit is invoked once per successful process() call."""
    with patch.object(svc, "_write_audit") as mock_audit:
        request = MagicMock()
        request.get_json.return_value = VALID_PAYLOAD
        svc.main(request)
    mock_audit.assert_called_once()


def test_audit_fires_on_validation_error():
    """_write_audit fires even when process() raises ValueError."""
    with patch.object(svc, "_write_audit") as mock_audit:
        request = MagicMock()
        request.get_json.return_value = {}  # missing all required fields
        svc.main(request)
    mock_audit.assert_called_once()
    # error argument (4th positional) should not be None
    _ctx, _inputs, _result, error = mock_audit.call_args[0]
    assert error is not None
