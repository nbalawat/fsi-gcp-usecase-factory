"""Unit tests for peer-benchmarker — pure function tests, Cloud SQL mocked."""
from __future__ import annotations

import ast
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import main as svc
from main import (
    SUPPORTED_RATIOS,
    VALID_SIZE_BANDS,
    build_peer_set,
    compute_percentile_rank,
    compute_ratio_percentiles,
    process,
    resolve_naics_prefix,
    select_peer_group,
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


# ── Inline peer data replacing BigQuery calls ──────────────────────────────────
# These match the shape returned by _load_peer_data().

_MFG_MID_PEERS = [
    {"dscr": 1.35, "leverage": 2.5, "current_ratio": 1.5, "ebitda_margin": 0.12},
    {"dscr": 1.20, "leverage": 3.0, "current_ratio": 1.3, "ebitda_margin": 0.10},
    {"dscr": 1.55, "leverage": 2.0, "current_ratio": 1.8, "ebitda_margin": 0.14},
    {"dscr": 1.05, "leverage": 3.8, "current_ratio": 1.1, "ebitda_margin": 0.07},
    {"dscr": 1.75, "leverage": 1.6, "current_ratio": 2.2, "ebitda_margin": 0.17},
]

_HC_SMALL_PEERS = [
    {"dscr": 1.40, "leverage": 2.0, "current_ratio": 1.8, "ebitda_margin": 0.08},
    {"dscr": 1.20, "leverage": 2.6, "current_ratio": 1.5, "ebitda_margin": 0.06},
    {"dscr": 1.60, "leverage": 1.6, "current_ratio": 2.1, "ebitda_margin": 0.10},
    {"dscr": 1.05, "leverage": 3.1, "current_ratio": 1.2, "ebitda_margin": 0.04},
    {"dscr": 1.80, "leverage": 1.3, "current_ratio": 2.5, "ebitda_margin": 0.13},
]

_RETAIL_LARGE_PEERS = [
    {"dscr": 1.35, "leverage": 2.9, "current_ratio": 1.4, "ebitda_margin": 0.07},
    {"dscr": 1.15, "leverage": 3.6, "current_ratio": 1.2, "ebitda_margin": 0.05},
    {"dscr": 1.55, "leverage": 2.4, "current_ratio": 1.6, "ebitda_margin": 0.09},
    {"dscr": 1.00, "leverage": 4.4, "current_ratio": 1.0, "ebitda_margin": 0.03},
    {"dscr": 1.75, "leverage": 2.0, "current_ratio": 2.0, "ebitda_margin": 0.11},
]

_SVC_LARGE_PEERS = [
    {"dscr": 1.70, "leverage": 1.1, "current_ratio": 2.3, "ebitda_margin": 0.19},
    {"dscr": 1.50, "leverage": 1.6, "current_ratio": 2.0, "ebitda_margin": 0.16},
    {"dscr": 1.90, "leverage": 0.8, "current_ratio": 2.6, "ebitda_margin": 0.22},
    {"dscr": 1.35, "leverage": 2.1, "current_ratio": 1.7, "ebitda_margin": 0.13},
    {"dscr": 2.10, "leverage": 0.5, "current_ratio": 3.0, "ebitda_margin": 0.25},
]

_FALLBACK_PEERS = [
    {"dscr": 1.30, "leverage": 2.5, "current_ratio": 1.5, "ebitda_margin": 0.10},
    {"dscr": 1.10, "leverage": 3.2, "current_ratio": 1.2, "ebitda_margin": 0.07},
    {"dscr": 1.50, "leverage": 2.0, "current_ratio": 1.8, "ebitda_margin": 0.13},
    {"dscr": 0.95, "leverage": 4.0, "current_ratio": 1.0, "ebitda_margin": 0.05},
    {"dscr": 1.70, "leverage": 1.6, "current_ratio": 2.1, "ebitda_margin": 0.16},
]


def _annotate(peers: list[dict], prefix: str, band: str) -> list[dict]:
    """Add internal _naics_prefix and _size_band keys as _load_peer_data() does."""
    return [{**p, "_naics_prefix": prefix, "_size_band": band} for p in peers]


def _annotate_fallback(peers: list[dict]) -> list[dict]:
    return [{**p, "_naics_prefix": "fallback", "_size_band": "all"} for p in peers]


def _patch_peer_data(naics_prefix: str, size_band: str) -> list[dict]:
    """Return annotated in-memory peer data matching the requested NAICS/band."""
    mapping = {
        ("33", "mid"): _annotate(_MFG_MID_PEERS, "33", "mid"),
        ("62", "small"): _annotate(_HC_SMALL_PEERS, "62", "small"),
        ("44", "large"): _annotate(_RETAIL_LARGE_PEERS, "44", "large"),
        ("54", "large"): _annotate(_SVC_LARGE_PEERS, "54", "large"),
    }
    key = (naics_prefix, size_band)
    if key in mapping:
        return mapping[key]
    # Unknown: return fallback rows only
    return _annotate_fallback(_FALLBACK_PEERS)


# ── Fixtures ──────────────────────────────────────────────────────────────────

MANUFACTURING_PAYLOAD = {
    "context_id": "test-mfg-001",
    "borrower_id": "DEMO-MFG-001",
    "borrower_naics": "332110",
    "borrower_size_band": "mid",
    "borrower_ratios": {
        "dscr": 1.40,
        "leverage": 2.3,
        "current_ratio": 1.6,
        "ebitda_margin": 0.11,
    },
}

HEALTHCARE_PAYLOAD = {
    "context_id": "test-hc-001",
    "borrower_id": "DEMO-HC-001",
    "borrower_naics": "621111",
    "borrower_size_band": "small",
    "borrower_ratios": {
        "dscr": 1.50,
        "leverage": 2.0,
        "current_ratio": 2.0,
        "ebitda_margin": 0.09,
    },
}

RETAIL_PAYLOAD = {
    "context_id": "test-ret-001",
    "borrower_id": "DEMO-RET-001",
    "borrower_naics": "441110",
    "borrower_size_band": "large",
    "borrower_ratios": {
        "dscr": 1.35,
        "leverage": 3.0,
        "current_ratio": 1.4,
        "ebitda_margin": 0.07,
    },
}

SERVICES_PAYLOAD = {
    "context_id": "test-svc-001",
    "borrower_id": "DEMO-SVC-001",
    "borrower_naics": "541512",
    "borrower_size_band": "large",
    "borrower_ratios": {
        "dscr": 1.75,
        "leverage": 1.1,
        "current_ratio": 2.3,
        "ebitda_margin": 0.19,
    },
}

UNKNOWN_NAICS_PAYLOAD = {
    "context_id": "test-unk-001",
    "borrower_id": "DEMO-UNK-001",
    "borrower_naics": "999999",
    "borrower_size_band": "mid",
    "borrower_ratios": {"dscr": 1.20, "leverage": 2.5},
}


# ── resolve_naics_prefix ───────────────────────────────────────────────────────

def test_naics_prefix_6digit():
    assert resolve_naics_prefix("332110") == "33"


def test_naics_prefix_2digit():
    assert resolve_naics_prefix("44") == "44"


def test_naics_prefix_strips_whitespace():
    assert resolve_naics_prefix("  621111") == "62"


# ── select_peer_group ─────────────────────────────────────────────────────────

def test_select_peers_manufacturing_mid():
    peer_data = _annotate(_MFG_MID_PEERS, "33", "mid")
    peers, is_exact = select_peer_group("332110", "mid", peer_data)
    assert is_exact is True
    assert len(peers) == 5
    assert all("dscr" in p for p in peers)


def test_select_peers_healthcare_small():
    peer_data = _annotate(_HC_SMALL_PEERS, "62", "small")
    peers, is_exact = select_peer_group("621111", "small", peer_data)
    assert is_exact is True
    assert len(peers) == 5


def test_select_peers_retail_large():
    peer_data = _annotate(_RETAIL_LARGE_PEERS, "44", "large")
    peers, is_exact = select_peer_group("441110", "large", peer_data)
    assert is_exact is True
    assert len(peers) > 0


def test_select_peers_services_large():
    peer_data = _annotate(_SVC_LARGE_PEERS, "54", "large")
    peers, is_exact = select_peer_group("541512", "large", peer_data)
    assert is_exact is True
    assert len(peers) > 0


def test_select_peers_unknown_naics_falls_back():
    peer_data = _annotate_fallback(_FALLBACK_PEERS)
    peers, is_exact = select_peer_group("999999", "mid", peer_data)
    assert is_exact is False
    assert len(peers) > 0


def test_select_peers_known_sector_wrong_band_still_matches():
    # Only "large" band available; request "small" — should still return sector match
    peer_data = _annotate(_MFG_MID_PEERS, "33", "large")
    peers, is_exact = select_peer_group("330000", "small", peer_data)
    # is_exact is False (band mismatch) but sector matched
    assert len(peers) > 0


# ── compute_percentile_rank ───────────────────────────────────────────────────

def test_percentile_rank_above_all():
    rank = compute_percentile_rank(10.0, [1.0, 2.0, 3.0, 4.0])
    assert rank == 100.0


def test_percentile_rank_below_all():
    rank = compute_percentile_rank(0.5, [1.0, 2.0, 3.0, 4.0])
    assert rank == 0.0


def test_percentile_rank_median():
    rank = compute_percentile_rank(3.0, [1.0, 2.0, 4.0, 5.0])
    assert rank == 50.0


def test_percentile_rank_empty_peers():
    rank = compute_percentile_rank(1.5, [])
    assert rank == 50.0


# ── compute_ratio_percentiles ─────────────────────────────────────────────────

def test_ratio_percentiles_keys_present():
    peers_raw = _MFG_MID_PEERS
    ratios = {"dscr": 1.40, "leverage": 2.3, "current_ratio": 1.6, "ebitda_margin": 0.11}
    result = compute_ratio_percentiles(ratios, peers_raw)
    for key in ratios:
        assert key in result
        assert "borrower_value" in result[key]
        assert "peer_median" in result[key]
        assert "peer_p25" in result[key]
        assert "peer_p75" in result[key]
        assert "percentile_rank" in result[key]


def test_ratio_percentiles_borrower_value_preserved():
    result = compute_ratio_percentiles({"dscr": 1.40}, _MFG_MID_PEERS)
    assert result["dscr"]["borrower_value"] == 1.40


def test_ratio_percentiles_unsupported_ratio_excluded():
    result = compute_ratio_percentiles(
        {"dscr": 1.40, "made_up_ratio": 99.9}, _MFG_MID_PEERS
    )
    assert "made_up_ratio" not in result
    assert "dscr" in result


def test_ratio_percentiles_p25_le_median_le_p75():
    result = compute_ratio_percentiles(
        {"dscr": 1.50, "leverage": 1.8}, _HC_SMALL_PEERS
    )
    for rname, data in result.items():
        assert data["peer_p25"] <= data["peer_median"] <= data["peer_p75"], (
            f"{rname}: p25={data['peer_p25']} median={data['peer_median']} p75={data['peer_p75']}"
        )


# ── build_peer_set ────────────────────────────────────────────────────────────

def test_build_peer_set_length():
    peer_set = build_peer_set(_MFG_MID_PEERS, "332110", "mid", True)
    assert len(peer_set) == len(_MFG_MID_PEERS)


def test_build_peer_set_has_peer_id():
    peer_set = build_peer_set(_MFG_MID_PEERS, "332110", "mid", True)
    assert all("peer_id" in p for p in peer_set)


def test_build_peer_set_has_ratios():
    peer_set = build_peer_set(_HC_SMALL_PEERS, "621111", "small", True)
    assert all("ratios" in p for p in peer_set)
    assert all("dscr" in p["ratios"] for p in peer_set)


# ── validate_inputs ───────────────────────────────────────────────────────────

def test_validate_missing_naics():
    with pytest.raises(ValueError, match="missing required fields"):
        validate_inputs({"borrower_size_band": "mid", "borrower_ratios": {"dscr": 1.0}})


def test_validate_missing_size_band():
    with pytest.raises(ValueError, match="missing required fields"):
        validate_inputs({"borrower_naics": "332110", "borrower_ratios": {"dscr": 1.0}})


def test_validate_missing_ratios():
    with pytest.raises(ValueError, match="missing required fields"):
        validate_inputs({"borrower_naics": "332110", "borrower_size_band": "mid"})


def test_validate_invalid_size_band():
    with pytest.raises(ValueError, match="borrower_size_band"):
        validate_inputs({
            "borrower_naics": "332110",
            "borrower_size_band": "giant",
            "borrower_ratios": {"dscr": 1.0},
        })


def test_validate_empty_ratios():
    with pytest.raises(ValueError, match="at least one ratio"):
        validate_inputs({
            "borrower_naics": "332110",
            "borrower_size_band": "mid",
            "borrower_ratios": {},
        })


def test_validate_ratios_not_dict():
    with pytest.raises(ValueError, match="borrower_ratios must be a JSON object"):
        validate_inputs({
            "borrower_naics": "332110",
            "borrower_size_band": "mid",
            "borrower_ratios": [1.0, 2.0],
        })


# ── process() full integration (engine mocked) ───────────────────────────────

def test_process_manufacturing_happy_path():
    with patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data):
        result = process(MANUFACTURING_PAYLOAD)
    assert "peer_set" in result
    assert "ratio_percentiles" in result
    assert result["context_id"] == "test-mfg-001"
    assert result["borrower_id"] == "DEMO-MFG-001"
    assert len(result["peer_set"]) > 0


def test_process_healthcare_happy_path():
    with patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data):
        result = process(HEALTHCARE_PAYLOAD)
    assert len(result["peer_set"]) > 0
    assert "dscr" in result["ratio_percentiles"]


def test_process_retail_peer_count():
    with patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data):
        result = process(RETAIL_PAYLOAD)
    assert len(result["peer_set"]) == 5


def test_process_services_all_ratios_computed():
    with patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data):
        result = process(SERVICES_PAYLOAD)
    for ratio in ["dscr", "leverage", "current_ratio", "ebitda_margin"]:
        assert ratio in result["ratio_percentiles"]


def test_process_unknown_naics_falls_back_gracefully():
    with patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data):
        result = process(UNKNOWN_NAICS_PAYLOAD)
    assert len(result["peer_set"]) > 0
    assert "dscr" in result["ratio_percentiles"]
    assert all(not p["exact_match"] for p in result["peer_set"])


def test_process_size_band_case_insensitive():
    payload = {**MANUFACTURING_PAYLOAD, "borrower_size_band": "MID"}
    with patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data):
        result = process(payload)
    assert result["size_band"] == "mid"


def test_process_single_ratio_only():
    payload = {
        "borrower_naics": "332110",
        "borrower_size_band": "mid",
        "borrower_ratios": {"dscr": 1.25},
    }
    with patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data):
        result = process(payload)
    assert "dscr" in result["ratio_percentiles"]
    assert len(result["ratio_percentiles"]) == 1


def test_process_percentile_rank_is_0_to_100():
    with patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data):
        result = process(MANUFACTURING_PAYLOAD)
    for rname, data in result["ratio_percentiles"].items():
        assert 0 <= data["percentile_rank"] <= 100, (
            f"{rname} percentile_rank={data['percentile_rank']} out of range"
        )


def test_process_borrower_value_matches_input():
    with patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data):
        result = process(MANUFACTURING_PAYLOAD)
    assert result["ratio_percentiles"]["dscr"]["borrower_value"] == 1.40
    assert result["ratio_percentiles"]["leverage"]["borrower_value"] == 2.3


# ── Mandatory new tests ────────────────────────────────────────────────────────

def test_no_hardcoded_threshold():
    """
    AST check: no module-level numeric assignment with threshold-like names exists.
    PEER_TABLE and FALLBACK_PEERS (hardcoded peer data) must not appear as module
    constants — peer data must come from Cloud SQL.
    """
    source = (Path(__file__).parent.parent / "main.py").read_text()
    tree = ast.parse(source)
    forbidden = {"PEER_TABLE", "FALLBACK_PEERS"}
    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in forbidden:
                    violations.append(target.id)
    assert violations == [], (
        f"Hardcoded peer data constant(s) found in main.py: {violations}. "
        "Move them to Cloud SQL threshold table."
    )


def test_audit_write_called():
    """_write_audit is invoked once per main() call (success path)."""
    with (
        patch.object(svc, "_load_peer_data", side_effect=_patch_peer_data),
        patch.object(svc, "_write_audit") as mock_audit,
    ):
        request = MagicMock()
        request.get_json.return_value = MANUFACTURING_PAYLOAD
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
