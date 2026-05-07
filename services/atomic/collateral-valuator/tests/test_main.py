"""Unit tests for collateral-valuator — pure function tests, Cloud SQL mocked."""
from __future__ import annotations

import ast
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import main as svc
from main import (
    adjusted_value,
    compute_haircut,
    process,
    validate_inputs,
    value_item,
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


# ── Reference data (mirrors what Cloud SQL would return) ─────────────────────

TYPE_CONFIG = {
    "real_estate":           {"base_haircut": 0.20, "age_decay_per_year": 0.0,  "max_haircut": 0.20},
    "equipment":             {"base_haircut": 0.40, "age_decay_per_year": 0.05, "max_haircut": 0.70},
    "accounts_receivable":   {"base_haircut": 0.25, "age_decay_per_year": 0.0,  "max_haircut": 0.25},
    "inventory":             {"base_haircut": 0.50, "age_decay_per_year": 0.0,  "max_haircut": 0.50},
    "marketable_securities": {"base_haircut": 0.10, "age_decay_per_year": 0.0,  "max_haircut": 0.10},
}

CONDITION_MULTIPLIERS = {
    "excellent": 1.00,
    "good":      0.95,
    "fair":      0.85,
    "poor":      0.70,
}


def _thresholds() -> dict:
    return {
        "type_config": TYPE_CONFIG,
        "condition_multipliers": CONDITION_MULTIPLIERS,
    }


# ── Fixtures ────────────────────────────────────────────────────────────────────

REAL_ESTATE_ITEM = {
    "type": "real_estate",
    "estimated_value": 1_000_000,
    "age_years": 0,
    "condition": "good",
}

EQUIPMENT_ITEM = {
    "type": "equipment",
    "estimated_value": 500_000,
    "age_years": 4,
    "condition": "good",
}

AR_ITEM = {
    "type": "accounts_receivable",
    "estimated_value": 200_000,
    "age_years": 0,
    "condition": "excellent",
}

INVENTORY_ITEM = {
    "type": "inventory",
    "estimated_value": 300_000,
    "age_years": 0,
    "condition": "fair",
}

SECURITIES_ITEM = {
    "type": "marketable_securities",
    "estimated_value": 400_000,
    "age_years": 0,
    "condition": "excellent",
}

VALID_PAYLOAD = {
    "context_id": "test-col-001",
    "borrower_id": "DEMO-MFG-001",
    "valuation_date": "2026-05-06",
    "collateral_descriptions": [REAL_ESTATE_ITEM, EQUIPMENT_ITEM, AR_ITEM],
}


# ── adjusted_value tests ────────────────────────────────────────────────────────

def test_adjusted_value_good_condition():
    result = adjusted_value(1_000_000, "good", CONDITION_MULTIPLIERS)
    assert result == 950_000.0


def test_adjusted_value_excellent_condition():
    result = adjusted_value(1_000_000, "excellent", CONDITION_MULTIPLIERS)
    assert result == 1_000_000.0


def test_adjusted_value_fair_condition():
    result = adjusted_value(1_000_000, "fair", CONDITION_MULTIPLIERS)
    assert result == 850_000.0


def test_adjusted_value_poor_condition():
    result = adjusted_value(1_000_000, "poor", CONDITION_MULTIPLIERS)
    assert result == 700_000.0


def test_adjusted_value_unknown_condition_defaults_to_fair():
    # Unknown condition falls back to 0.85 (same as "fair")
    result = adjusted_value(1_000_000, "unknown_condition", CONDITION_MULTIPLIERS)
    assert result == 850_000.0


# ── compute_haircut tests ───────────────────────────────────────────────────────

def test_haircut_real_estate_fixed():
    pct, rationale = compute_haircut("real_estate", 0, TYPE_CONFIG)
    assert pct == 0.20
    assert "real_estate" in rationale


def test_haircut_accounts_receivable():
    pct, _ = compute_haircut("accounts_receivable", 0, TYPE_CONFIG)
    assert pct == 0.25


def test_haircut_inventory():
    pct, _ = compute_haircut("inventory", 0, TYPE_CONFIG)
    assert pct == 0.50


def test_haircut_marketable_securities():
    pct, _ = compute_haircut("marketable_securities", 0, TYPE_CONFIG)
    assert pct == 0.10


def test_haircut_equipment_base():
    pct, _ = compute_haircut("equipment", 0, TYPE_CONFIG)
    assert pct == 0.40


def test_haircut_equipment_with_age():
    # base 40% + 4 years * 5%/yr = 60%
    pct, rationale = compute_haircut("equipment", 4, TYPE_CONFIG)
    assert pct == 0.60
    assert "4.0 yrs" in rationale


def test_haircut_equipment_age_capped_at_max():
    # base 40% + 10 years * 5%/yr = 90%, but max is 70%
    pct, rationale = compute_haircut("equipment", 10, TYPE_CONFIG)
    assert pct == 0.70
    assert "70%" in rationale


def test_haircut_equipment_fractional_age():
    # base 40% + 2.5 years * 5%/yr = 52.5%
    pct, _ = compute_haircut("equipment", 2.5, TYPE_CONFIG)
    assert pct == round(0.40 + 0.05 * 2.5, 4)


def test_haircut_unsupported_type_raises():
    with pytest.raises(ValueError, match="unsupported collateral type"):
        compute_haircut("gold_bullion", 0, TYPE_CONFIG)


# ── value_item tests ────────────────────────────────────────────────────────────

def test_value_item_real_estate_good():
    val, hc, lendable = value_item(REAL_ESTATE_ITEM, TYPE_CONFIG, CONDITION_MULTIPLIERS)
    # adjusted = 1_000_000 * 0.95 (good) = 950_000
    # haircut = 20%
    # lendable = 950_000 * 0.80 = 760_000
    assert val["adjusted_value"] == 950_000.0
    assert hc["haircut_pct"] == 0.20
    assert lendable == 760_000.0


def test_value_item_equipment_with_age():
    # good condition: 500_000 * 0.95 = 475_000
    # haircut = 40% + 4*5% = 60%
    # lendable = 475_000 * 0.40 = 190_000
    val, hc, lendable = value_item(EQUIPMENT_ITEM, TYPE_CONFIG, CONDITION_MULTIPLIERS)
    assert val["adjusted_value"] == 475_000.0
    assert hc["haircut_pct"] == 0.60
    assert lendable == pytest.approx(190_000.0)


def test_value_item_accounts_receivable_excellent():
    # excellent: 200_000 * 1.0 = 200_000
    # haircut = 25%
    # lendable = 200_000 * 0.75 = 150_000
    val, hc, lendable = value_item(AR_ITEM, TYPE_CONFIG, CONDITION_MULTIPLIERS)
    assert val["adjusted_value"] == 200_000.0
    assert lendable == 150_000.0


# ── validate_inputs tests ───────────────────────────────────────────────────────

def test_validate_missing_collateral_descriptions():
    with pytest.raises(ValueError, match="collateral_descriptions"):
        validate_inputs({})


def test_validate_collateral_not_list():
    with pytest.raises(ValueError, match="must be a list"):
        validate_inputs({"collateral_descriptions": {"type": "real_estate"}})


def test_validate_empty_list():
    with pytest.raises(ValueError, match="must not be empty"):
        validate_inputs({"collateral_descriptions": []})


def test_validate_item_missing_type():
    with pytest.raises(ValueError, match="missing required field: type"):
        validate_inputs({"collateral_descriptions": [{"estimated_value": 100}]})


def test_validate_item_missing_estimated_value():
    with pytest.raises(ValueError, match="missing required field: estimated_value"):
        validate_inputs({"collateral_descriptions": [{"type": "real_estate"}]})


# ── process() integration tests (engine mocked) ─────────────────────────────────

def test_process_happy_path_structure():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(VALID_PAYLOAD)
    assert "valuation_per_item" in result
    assert "haircut_per_item" in result
    assert "lendable_value" in result
    assert result["context_id"] == "test-col-001"
    assert result["borrower_id"] == "DEMO-MFG-001"
    assert len(result["valuation_per_item"]) == 3
    assert len(result["haircut_per_item"]) == 3


def test_process_lendable_value_calculation():
    payload = {
        "valuation_date": "2026-05-06",
        "collateral_descriptions": [
            {
                "type": "real_estate",
                "estimated_value": 1_000_000,
                "age_years": 0,
                "condition": "excellent",
            }
        ],
    }
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(payload)
    # adj = 1_000_000 * 1.0 = 1_000_000; haircut 20%; lendable = 800_000
    assert result["lendable_value"] == 800_000.0


def test_process_mixed_portfolio():
    payload = {
        "valuation_date": "2026-05-06",
        "collateral_descriptions": [
            {"type": "real_estate",           "estimated_value": 1_000_000, "age_years": 0, "condition": "excellent"},
            {"type": "marketable_securities", "estimated_value": 500_000,   "age_years": 0, "condition": "excellent"},
            {"type": "inventory",             "estimated_value": 200_000,   "age_years": 0, "condition": "excellent"},
        ],
    }
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(payload)
    # real_estate: 1_000_000 * 0.80 = 800_000
    # securities:    500_000 * 0.90 = 450_000
    # inventory:     200_000 * 0.50 = 100_000
    # total = 1_350_000
    assert result["lendable_value"] == 1_350_000.0


def test_process_equipment_cap_enforced():
    payload = {
        "valuation_date": "2026-05-06",
        "collateral_descriptions": [
            {"type": "equipment", "estimated_value": 1_000_000, "age_years": 20, "condition": "excellent"},
        ],
    }
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(payload)
    # haircut capped at 70%; lendable = 1_000_000 * 0.30 = 300_000
    assert result["lendable_value"] == 300_000.0
    assert result["haircut_per_item"][0]["haircut_pct"] == 0.70


def test_process_unsupported_type_raises():
    payload = {
        "collateral_descriptions": [
            {"type": "crypto", "estimated_value": 100_000, "age_years": 0, "condition": "good"},
        ]
    }
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        with pytest.raises(ValueError, match="unsupported collateral type"):
            process(payload)


def test_process_valuation_date_passed_through():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(VALID_PAYLOAD)
    assert result["valuation_date"] == "2026-05-06"


def test_process_single_item_ar():
    payload = {
        "collateral_descriptions": [
            {"type": "accounts_receivable", "estimated_value": 400_000, "age_years": 0, "condition": "good"},
        ]
    }
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(payload)
    # adj = 400_000 * 0.95 = 380_000; haircut = 25%; lendable = 285_000
    assert result["lendable_value"] == 285_000.0


# ── Mandatory new tests ────────────────────────────────────────────────────────

def test_no_hardcoded_threshold():
    """
    AST check: module-level constants named _TYPE_CONFIG or _CONDITION_MULTIPLIERS
    must not appear as dict-literal assignments in main.py.
    Those values must come from Cloud SQL.
    """
    source = (Path(__file__).parent.parent / "main.py").read_text()
    tree = ast.parse(source)
    forbidden = {"_TYPE_CONFIG", "_CONDITION_MULTIPLIERS"}
    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in forbidden:
                    violations.append(target.id)
    assert violations == [], (
        f"Hardcoded threshold constant(s) found in main.py: {violations}. "
        "Move them to Cloud SQL threshold table."
    )


def test_audit_write_called():
    """_write_audit is invoked once per main() call (success path)."""
    with (
        patch.object(svc, "_load_thresholds", return_value=_thresholds()),
        patch.object(svc, "_write_audit") as mock_audit,
    ):
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
    _ctx, _inputs, _result, error = mock_audit.call_args[0]
    assert error is not None
