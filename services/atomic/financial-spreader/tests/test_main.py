"""Unit tests for financial-spreader — real SQLite DB, no mocks."""
import pytest
from sqlalchemy import text
from main import (
    classify_ratio_quality,
    compute_ratios,
    process,
    spread_balance_sheet,
    spread_cash_flow,
    spread_income_statement,
    validate_inputs,
    _load_thresholds,
    _write_audit,
)

# ── Fixtures ───────────────────────────────────────────────────────────────

INCOME_RAW = {
    "revenue": 100_000_000,
    "cogs": 60_000_000,
    "ebitda": 18_000_000,
    "interest_expense": 2_000_000,
    "net_income": 10_000_000,
    "depreciation_amortization": 3_000_000,
}

BALANCE_RAW = {
    "total_assets": 80_000_000,
    "total_debt": 30_000_000,
    "total_equity": 50_000_000,
    "current_assets": 25_000_000,
    "current_liabilities": 12_000_000,
    "cash_and_equivalents": 5_000_000,
    "inventory": 8_000_000,
    "accounts_receivable": 12_000_000,
}

CASHFLOW_RAW = {
    "operating_cash_flow": 15_000_000,
    "capex": -4_000_000,
}

VALID_PAYLOAD = {
    "context_id": "test-001",
    "borrower_id": "DEMO-MFG-001",
    "period": "2025",
    "income_statement": INCOME_RAW,
    "balance_sheet": BALANCE_RAW,
    "cash_flow": CASHFLOW_RAW,
}


# ── Income statement ───────────────────────────────────────────────────────

def test_income_gross_profit():
    assert spread_income_statement(INCOME_RAW)["gross_profit"] == 40_000_000


def test_income_gross_margin():
    assert spread_income_statement(INCOME_RAW)["gross_margin"] == 0.4


def test_income_ebitda_margin():
    assert spread_income_statement(INCOME_RAW)["ebitda_margin"] == 0.18


def test_income_net_margin():
    assert spread_income_statement(INCOME_RAW)["net_margin"] == 0.10


def test_income_ebit():
    assert spread_income_statement(INCOME_RAW)["ebit"] == 18_000_000 - 3_000_000


def test_income_zero_revenue():
    result = spread_income_statement({"revenue": 0, "cogs": 0})
    assert result["gross_margin"] == 0
    assert result["ebitda_margin"] == 0


# ── Balance sheet ──────────────────────────────────────────────────────────

def test_balance_working_capital():
    assert spread_balance_sheet(BALANCE_RAW)["working_capital"] == 13_000_000


def test_balance_current_ratio():
    assert spread_balance_sheet(BALANCE_RAW)["current_ratio"] == round(25_000_000 / 12_000_000, 4)


def test_balance_quick_ratio():
    expected = round((25_000_000 - 8_000_000) / 12_000_000, 4)
    assert spread_balance_sheet(BALANCE_RAW)["quick_ratio"] == expected


def test_balance_leverage():
    assert spread_balance_sheet(BALANCE_RAW)["leverage_ratio"] == round(30_000_000 / 50_000_000, 4)


def test_balance_zero_equity():
    result = spread_balance_sheet({"total_assets": 10, "total_debt": 10, "total_equity": 0})
    assert result["leverage_ratio"] is None


# ── Cash flow ──────────────────────────────────────────────────────────────

def test_cashflow_fcf():
    assert spread_cash_flow(CASHFLOW_RAW)["free_cash_flow"] == 11_000_000


def test_cashflow_fcf_margin_none_without_revenue():
    assert spread_cash_flow(CASHFLOW_RAW)["fcf_margin"] is None


# ── Ratios ─────────────────────────────────────────────────────────────────

def test_ratios_debt_to_ebitda():
    income = spread_income_statement(INCOME_RAW)
    balance = spread_balance_sheet(BALANCE_RAW)
    cf = spread_cash_flow(CASHFLOW_RAW)
    ratios = compute_ratios(income, balance, cf, periods=1)
    assert ratios["debt_to_ebitda"] == round(30_000_000 / 18_000_000, 2)


def test_ratios_zero_ebitda():
    income = spread_income_statement({**INCOME_RAW, "ebitda": 0})
    balance = spread_balance_sheet(BALANCE_RAW)
    cf = spread_cash_flow(CASHFLOW_RAW)
    ratios = compute_ratios(income, balance, cf, periods=1)
    assert ratios["debt_to_ebitda"] is None


# ── Thresholds loaded from real SQLite DB ──────────────────────────────────

def test_load_thresholds_from_db():
    thresholds = _load_thresholds()
    assert thresholds["debt_to_ebitda_strong"] == 3.0
    assert thresholds["debt_to_ebitda_weak"] == 6.0
    assert thresholds["return_on_assets_strong"] == 0.05
    assert thresholds["return_on_assets_weak"] == 0.01


# ── classify_ratio_quality uses real threshold values ─────────────────────

def test_ratio_quality_strong_dte():
    thresholds = _load_thresholds()
    quality = classify_ratio_quality({"debt_to_ebitda": 2.5}, thresholds)
    assert quality["debt_to_ebitda"] == "strong"


def test_ratio_quality_weak_dte():
    thresholds = _load_thresholds()
    quality = classify_ratio_quality({"debt_to_ebitda": 7.0}, thresholds)
    assert quality["debt_to_ebitda"] == "weak"


def test_ratio_quality_adequate_dte():
    thresholds = _load_thresholds()
    quality = classify_ratio_quality({"debt_to_ebitda": 4.5}, thresholds)
    assert quality["debt_to_ebitda"] == "adequate"


# ── process() end-to-end ───────────────────────────────────────────────────

def test_process_happy_path():
    result = process(VALID_PAYLOAD)
    assert "spread_income_statement" in result
    assert "spread_balance_sheet" in result
    assert "spread_cash_flow" in result
    assert "ratios" in result
    assert "ratio_quality" in result
    assert result["context_id"] == "test-001"
    assert result["borrower_id"] == "DEMO-MFG-001"


def test_process_all_output_fields_present():
    result = process(VALID_PAYLOAD)
    for field in ["spread_income_statement", "spread_balance_sheet", "spread_cash_flow", "ratios", "ratio_quality"]:
        assert field in result, f"Missing output field: {field}"


def test_process_fcf_margin_populated():
    result = process(VALID_PAYLOAD)
    assert result["spread_cash_flow"]["fcf_margin"] is not None


def test_process_missing_income_statement():
    with pytest.raises(ValueError, match="income_statement"):
        process({"balance_sheet": BALANCE_RAW, "cash_flow": CASHFLOW_RAW})


def test_process_missing_balance_sheet():
    with pytest.raises(ValueError, match="balance_sheet"):
        process({"income_statement": INCOME_RAW, "cash_flow": CASHFLOW_RAW})


def test_process_income_not_dict():
    with pytest.raises(ValueError, match="income_statement must be an object"):
        process({"income_statement": "bad", "balance_sheet": BALANCE_RAW, "cash_flow": CASHFLOW_RAW})


def test_process_empty_payload():
    with pytest.raises(ValueError):
        process({})


# ── Audit writes verified in real SQLite ───────────────────────────────────

def test_audit_write_inserts_row(test_db):
    process(VALID_PAYLOAD)
    with test_db.connect() as conn:
        rows = conn.execute(
            text("SELECT service_name, context_id, error FROM audit_events WHERE context_id = 'test-001'")
        ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "financial-spreader"
    assert rows[0][2] is None  # no error on success


def test_audit_fires_on_validation_error(test_db):
    try:
        process({})  # triggers ValueError
    except ValueError:
        pass
    with test_db.connect() as conn:
        rows = conn.execute(
            text("SELECT error FROM audit_events WHERE service_name = 'financial-spreader'")
        ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] is not None  # error is recorded


def test_audit_write_directly(test_db):
    _write_audit("ctx-direct", {"key": "val"}, {"out": 1}, error=None)
    with test_db.connect() as conn:
        row = conn.execute(
            text("SELECT context_id, invoked_at FROM audit_events WHERE context_id = 'ctx-direct'")
        ).fetchone()
    assert row is not None
    assert row[1] is not None  # invoked_at was set


# ── Threshold boundary — classification changes at cutoff ─────────────────

def test_ratio_quality_boundary_exactly_at_strong(test_db):
    thresholds = _load_thresholds()
    # debt_to_ebitda_strong = 3.0; exactly at boundary → strong
    quality = classify_ratio_quality({"debt_to_ebitda": 3.0}, thresholds)
    assert quality["debt_to_ebitda"] == "strong"


def test_ratio_quality_boundary_exactly_at_weak(test_db):
    thresholds = _load_thresholds()
    # debt_to_ebitda_weak = 6.0; exactly at boundary → weak
    quality = classify_ratio_quality({"debt_to_ebitda": 6.0}, thresholds)
    assert quality["debt_to_ebitda"] == "weak"


# ── Later threshold version takes precedence ───────────────────────────────

def test_threshold_versioning_latest_wins(test_db):
    with test_db.begin() as conn:
        conn.execute(text(
            "INSERT INTO thresholds (service_name, threshold_name, threshold_value, effective_date) "
            "VALUES ('financial-spreader', 'debt_to_ebitda_strong', 2.5, '2025-01-01')"
        ))
    thresholds = _load_thresholds()
    assert thresholds["debt_to_ebitda_strong"] == 2.5  # newer row wins


# ── Large enterprise numbers ───────────────────────────────────────────────

def test_process_large_enterprise():
    payload = {
        "context_id": "test-002",
        "borrower_id": "DEMO-ENT-001",
        "period": "2025",
        "income_statement": {
            "revenue": 2_000_000_000,
            "cogs": 1_200_000_000,
            "ebitda": 320_000_000,
            "interest_expense": 40_000_000,
            "net_income": 180_000_000,
            "depreciation_amortization": 60_000_000,
        },
        "balance_sheet": {
            "total_assets": 1_500_000_000,
            "total_debt": 500_000_000,
            "total_equity": 1_000_000_000,
            "current_assets": 400_000_000,
            "current_liabilities": 200_000_000,
        },
        "cash_flow": {"operating_cash_flow": 280_000_000, "capex": -80_000_000},
    }
    result = process(payload)
    assert result["ratios"]["debt_to_ebitda"] == round(500_000_000 / 320_000_000, 2)
    assert result["spread_income_statement"]["ebitda_margin"] == 0.16
