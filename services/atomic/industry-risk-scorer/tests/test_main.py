"""Unit tests for industry-risk-scorer — pure function tests, Cloud SQL mocked."""
from __future__ import annotations

import ast
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import main as svc
from main import (
    BAND_LABELS,
    VALID_GEOGRAPHIES,
    build_rationale_factors,
    clamp_band,
    process,
    resolve_geography_adjustment,
    resolve_sector,
    resolve_vintage_adjustment,
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


# ── Reference data (mirrors what Cloud SQL would return) ─────────────────────

SECTOR_RISK = {
    "62": (2.0, "healthcare"),
    "54": (2.0, "tech services"),
    "11": (3.0, "agriculture"),
    "33": (3.0, "manufacturing"),
    "31": (3.0, "manufacturing"),
    "32": (3.0, "manufacturing"),
    "44": (4.0, "retail"),
    "45": (4.0, "retail"),
    "21": (4.0, "energy"),
    "23": (4.0, "construction"),
    "48": (3.0, "transportation"),
    "49": (3.0, "transportation"),
    "52": (3.0, "financial services"),
    "53": (4.0, "real estate"),
    "61": (2.0, "education"),
    "72": (4.0, "accommodation and food service"),
    "42": (3.0, "wholesale"),
    "51": (2.0, "information"),
    "55": (3.0, "management"),
    "56": (3.0, "administrative services"),
    "71": (3.0, "arts and entertainment"),
    "81": (3.0, "other services"),
    "92": (2.0, "public administration"),
}

VINTAGE_ADJ = {
    2007: (0.5,  "pre-GFC late-cycle expansion"),
    2008: (1.0,  "Global Financial Crisis onset — contraction"),
    2009: (1.0,  "GFC trough — severe contraction"),
    2010: (0.0,  "recovery — neutral"),
    2011: (-0.5, "early expansion"),
    2012: (-0.5, "expansion"),
    2013: (-0.5, "expansion"),
    2014: (-0.5, "expansion"),
    2015: (-0.5, "mid-cycle expansion"),
    2016: (-0.5, "expansion"),
    2017: (-0.5, "expansion"),
    2018: (-0.5, "late expansion"),
    2019: (0.0,  "late cycle — neutral"),
    2020: (1.0,  "COVID-19 recession — severe contraction"),
    2021: (0.0,  "uneven recovery — neutral"),
    2022: (0.5,  "inflationary pressure — late cycle"),
    2023: (0.0,  "soft landing — neutral"),
    2024: (-0.5, "expansion"),
    2025: (-0.5, "expansion"),
    2026: (0.0,  "neutral — moderate growth"),
}

GEOGRAPHY_ADJ = {
    "coastal":   (0.0,   "coastal markets — baseline risk"),
    "midwest":   (-0.5,  "midwest — below-average regional risk"),
    "rural":     (0.5,   "rural — above-average regional risk due to concentration"),
    "northeast": (0.0,   "northeast — baseline risk"),
    "southeast": (0.0,   "southeast — baseline risk"),
    "southwest": (0.25,  "southwest — modest above-baseline risk"),
    "mountain":  (0.0,   "mountain region — baseline risk"),
    "pacific":   (0.0,   "pacific — baseline risk"),
    "plains":    (-0.25, "plains — slightly below-baseline risk"),
}

DEFAULT_SECTOR_SCORE = 3.0
PRE_2007_ADJUSTMENT = 0.25


def _thresholds() -> dict:
    return {
        "sector_risk": SECTOR_RISK,
        "vintage_adj": VINTAGE_ADJ,
        "geography_adj": GEOGRAPHY_ADJ,
        "default_sector_score": DEFAULT_SECTOR_SCORE,
        "pre_2007_adjustment": PRE_2007_ADJUSTMENT,
    }


# ── Fixtures ──────────────────────────────────────────────────────────────────

HEALTHCARE_PAYLOAD = {
    "context_id": "test-hc-001",
    "borrower_id": "DEMO-HC-001",
    "naics_code": "621111",
    "vintage": 2026,
    "geography": "coastal",
}

MANUFACTURING_PAYLOAD = {
    "context_id": "test-mfg-001",
    "borrower_id": "DEMO-MFG-001",
    "naics_code": "332110",
    "vintage": 2026,
    "geography": "midwest",
}

RETAIL_PAYLOAD = {
    "context_id": "test-ret-001",
    "borrower_id": "DEMO-RET-001",
    "naics_code": "441110",
    "vintage": 2026,
    "geography": "coastal",
}

ENERGY_PAYLOAD = {
    "context_id": "test-eng-001",
    "borrower_id": "DEMO-ENG-001",
    "naics_code": "211120",
    "vintage": 2026,
    "geography": "rural",
}

CONSTRUCTION_PAYLOAD = {
    "context_id": "test-con-001",
    "borrower_id": "DEMO-CON-001",
    "naics_code": "236115",
    "vintage": 2020,
    "geography": "rural",
}

TECH_PAYLOAD = {
    "context_id": "test-tech-001",
    "borrower_id": "DEMO-TECH-001",
    "naics_code": "541512",
    "vintage": 2025,
    "geography": "coastal",
}


# ── resolve_sector ────────────────────────────────────────────────────────────

def test_sector_healthcare():
    score, label, prefix = resolve_sector("621111", SECTOR_RISK, DEFAULT_SECTOR_SCORE)
    assert score == 2.0
    assert label == "healthcare"
    assert prefix == "62"


def test_sector_manufacturing():
    score, label, prefix = resolve_sector("332110", SECTOR_RISK, DEFAULT_SECTOR_SCORE)
    assert score == 3.0
    assert "manufacturing" in label


def test_sector_retail():
    score, label, prefix = resolve_sector("441110", SECTOR_RISK, DEFAULT_SECTOR_SCORE)
    assert score == 4.0
    assert "retail" in label


def test_sector_energy():
    score, label, prefix = resolve_sector("211120", SECTOR_RISK, DEFAULT_SECTOR_SCORE)
    assert score == 4.0
    assert "energy" in label


def test_sector_construction():
    score, label, prefix = resolve_sector("236115", SECTOR_RISK, DEFAULT_SECTOR_SCORE)
    assert score == 4.0
    assert "construction" in label


def test_sector_tech_services():
    score, label, prefix = resolve_sector("541512", SECTOR_RISK, DEFAULT_SECTOR_SCORE)
    assert score == 2.0
    assert "tech" in label


def test_sector_unknown_returns_default():
    score, label, prefix = resolve_sector("999999", SECTOR_RISK, DEFAULT_SECTOR_SCORE)
    assert score == 3.0
    assert "unknown" in label


def test_sector_prefix_is_two_chars():
    _, _, prefix = resolve_sector("621111", SECTOR_RISK, DEFAULT_SECTOR_SCORE)
    assert len(prefix) == 2


# ── resolve_vintage_adjustment ────────────────────────────────────────────────

def test_vintage_2026_neutral():
    adj, explanation = resolve_vintage_adjustment(2026, VINTAGE_ADJ, PRE_2007_ADJUSTMENT)
    assert adj == 0.0
    assert "2026" in explanation or "neutral" in explanation.lower()


def test_vintage_2020_recession():
    adj, explanation = resolve_vintage_adjustment(2020, VINTAGE_ADJ, PRE_2007_ADJUSTMENT)
    assert adj == 1.0
    assert "covid" in explanation.lower() or "contraction" in explanation.lower()


def test_vintage_2008_recession():
    adj, _ = resolve_vintage_adjustment(2008, VINTAGE_ADJ, PRE_2007_ADJUSTMENT)
    assert adj == 1.0


def test_vintage_2015_expansion():
    adj, _ = resolve_vintage_adjustment(2015, VINTAGE_ADJ, PRE_2007_ADJUSTMENT)
    assert adj == -0.5


def test_vintage_pre_2007_gets_positive_adjustment():
    adj, _ = resolve_vintage_adjustment(2000, VINTAGE_ADJ, PRE_2007_ADJUSTMENT)
    assert adj > 0


def test_vintage_string_input_parsed():
    adj, _ = resolve_vintage_adjustment("2026", VINTAGE_ADJ, PRE_2007_ADJUSTMENT)
    assert adj == 0.0


def test_vintage_invalid_string_returns_neutral():
    adj, explanation = resolve_vintage_adjustment(
        "not-a-year", VINTAGE_ADJ, PRE_2007_ADJUSTMENT
    )
    assert adj == 0.0
    assert "not parseable" in explanation or "neutral" in explanation.lower()


# ── resolve_geography_adjustment ──────────────────────────────────────────────

def test_geography_coastal_zero():
    adj, _ = resolve_geography_adjustment("coastal", GEOGRAPHY_ADJ)
    assert adj == 0.0


def test_geography_midwest_negative():
    adj, _ = resolve_geography_adjustment("midwest", GEOGRAPHY_ADJ)
    assert adj == -0.5


def test_geography_rural_positive():
    adj, _ = resolve_geography_adjustment("rural", GEOGRAPHY_ADJ)
    assert adj == 0.5


def test_geography_case_insensitive():
    adj_lower, _ = resolve_geography_adjustment("coastal", GEOGRAPHY_ADJ)
    adj_upper, _ = resolve_geography_adjustment("COASTAL", GEOGRAPHY_ADJ)
    assert adj_lower == adj_upper


def test_geography_unknown_returns_baseline():
    adj, explanation = resolve_geography_adjustment("atlantis", GEOGRAPHY_ADJ)
    assert adj == 0.0
    assert "baseline" in explanation.lower() or "not in lookup" in explanation.lower()


# ── clamp_band ────────────────────────────────────────────────────────────────

def test_clamp_band_within_range():
    assert clamp_band(3.0) == 3


def test_clamp_band_below_min():
    assert clamp_band(-5.0) == 1


def test_clamp_band_above_max():
    assert clamp_band(99.0) == 5


def test_clamp_band_rounds_half_up():
    assert clamp_band(3.5) == 4


def test_clamp_band_rounds_down():
    assert clamp_band(3.2) == 3


# ── validate_inputs ───────────────────────────────────────────────────────────

def test_validate_missing_naics():
    with pytest.raises(ValueError, match="missing required fields"):
        validate_inputs({"vintage": 2026, "geography": "coastal"})


def test_validate_missing_vintage():
    with pytest.raises(ValueError, match="missing required fields"):
        validate_inputs({"naics_code": "621111", "geography": "coastal"})


def test_validate_missing_geography():
    with pytest.raises(ValueError, match="missing required fields"):
        validate_inputs({"naics_code": "621111", "vintage": 2026})


def test_validate_invalid_vintage():
    with pytest.raises(ValueError, match="vintage must be a numeric year"):
        validate_inputs({"naics_code": "621111", "vintage": "spring", "geography": "coastal"})


def test_validate_invalid_geography():
    with pytest.raises(ValueError, match="geography must be one of"):
        validate_inputs({"naics_code": "621111", "vintage": 2026, "geography": "moon"})


# ── process() integration tests (engine mocked) ───────────────────────────────

def test_process_healthcare_low_risk():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(HEALTHCARE_PAYLOAD)
    assert result["industry_risk_band"].startswith("1") or result["industry_risk_band"].startswith("2")
    assert result["context_id"] == "test-hc-001"


def test_process_manufacturing_mid_risk():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(MANUFACTURING_PAYLOAD)
    band_num = int(result["industry_risk_band"].split("-")[0])
    assert 2 <= band_num <= 3


def test_process_retail_high_risk():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(RETAIL_PAYLOAD)
    assert result["industry_risk_band"].startswith("4")


def test_process_energy_rural_very_high():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(ENERGY_PAYLOAD)
    assert result["industry_risk_band"].startswith("5")


def test_process_construction_recession_rural_capped_at_5():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(CONSTRUCTION_PAYLOAD)
    assert result["industry_risk_band"].startswith("5")


def test_process_tech_services_low_risk():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(TECH_PAYLOAD)
    assert result["industry_risk_band"].startswith("1") or result["industry_risk_band"].startswith("2")


def test_process_rationale_factors_present():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(HEALTHCARE_PAYLOAD)
    assert "rationale_factors" in result
    assert len(result["rationale_factors"]) >= 3


def test_process_rationale_factor_keys():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(MANUFACTURING_PAYLOAD)
    for factor in result["rationale_factors"]:
        assert "factor" in factor
        assert "contribution" in factor
        assert "explanation" in factor


def test_process_rationale_has_sector_factor():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(RETAIL_PAYLOAD)
    factor_names = [f["factor"] for f in result["rationale_factors"]]
    assert "sector_base_risk" in factor_names


def test_process_rationale_has_vintage_factor():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(ENERGY_PAYLOAD)
    factor_names = [f["factor"] for f in result["rationale_factors"]]
    assert "economic_vintage" in factor_names


def test_process_rationale_has_geography_factor():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(CONSTRUCTION_PAYLOAD)
    factor_names = [f["factor"] for f in result["rationale_factors"]]
    assert "geographic_region" in factor_names


def test_process_output_keys_complete():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(HEALTHCARE_PAYLOAD)
    assert "industry_risk_band" in result
    assert "rationale_factors" in result
    assert "naics_code" in result
    assert "vintage" in result
    assert "geography" in result


def test_process_band_label_format():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result = process(HEALTHCARE_PAYLOAD)
    band = result["industry_risk_band"]
    parts = band.split("-", 1)
    assert len(parts) == 2
    assert parts[0].isdigit()
    assert 1 <= int(parts[0]) <= 5


def test_process_expansion_year_lowers_risk():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result_expansion = process(
            {**MANUFACTURING_PAYLOAD, "vintage": 2015, "geography": "coastal"}
        )
        result_neutral = process(
            {**MANUFACTURING_PAYLOAD, "vintage": 2026, "geography": "coastal"}
        )
    band_expansion = int(result_expansion["industry_risk_band"].split("-")[0])
    band_neutral = int(result_neutral["industry_risk_band"].split("-")[0])
    assert band_expansion <= band_neutral


def test_process_recession_year_raises_risk():
    with patch.object(svc, "_load_thresholds", return_value=_thresholds()):
        result_recession = process(
            {**MANUFACTURING_PAYLOAD, "vintage": 2020, "geography": "coastal"}
        )
        result_neutral = process(
            {**MANUFACTURING_PAYLOAD, "vintage": 2026, "geography": "coastal"}
        )
    band_recession = int(result_recession["industry_risk_band"].split("-")[0])
    band_neutral = int(result_neutral["industry_risk_band"].split("-")[0])
    assert band_recession >= band_neutral


# ── Mandatory new tests ────────────────────────────────────────────────────────

def test_no_hardcoded_threshold():
    """
    AST check: module-level constants named SECTOR_RISK, VINTAGE_ADJUSTMENTS,
    or GEOGRAPHY_ADJUSTMENTS must not appear as assignments in main.py.
    These are now loaded exclusively from Cloud SQL.
    """
    source = (Path(__file__).parent.parent / "main.py").read_text()
    tree = ast.parse(source)
    forbidden = {"SECTOR_RISK", "VINTAGE_ADJUSTMENTS", "GEOGRAPHY_ADJUSTMENTS",
                 "DEFAULT_SECTOR_SCORE"}
    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in forbidden:
                    violations.append(target.id)
    assert violations == [], (
        f"Hardcoded scoring table(s) found in main.py: {violations}. "
        "Move them to Cloud SQL threshold table."
    )


def test_audit_write_called():
    """_write_audit is invoked once per main() call (success path)."""
    with (
        patch.object(svc, "_load_thresholds", return_value=_thresholds()),
        patch.object(svc, "_write_audit") as mock_audit,
    ):
        request = MagicMock()
        request.get_json.return_value = HEALTHCARE_PAYLOAD
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
