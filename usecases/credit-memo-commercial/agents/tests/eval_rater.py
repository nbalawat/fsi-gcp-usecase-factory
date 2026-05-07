"""Eval suite for rater specialist. pytest -m eval to run (requires model + deployed services)."""
import json, pytest
from pathlib import Path

GOLDEN_DIR = Path(__file__).parent / "golden" / "rater"

REQUIRED_RISK_FIELDS = {
    "dscr_assessment",
    "covenant_risk",
    "industry_risk",
    "collateral_coverage",
    "peer_position",
    "exposure_risk",
    "overall_risk_band",
    "summary",
}


def load_cases():
    return [json.loads(f.read_text()) for f in GOLDEN_DIR.glob("*.json")] if GOLDEN_DIR.exists() else []


@pytest.mark.eval
@pytest.mark.parametrize("case", load_cases() or [{"skip": True}])
async def test_rater_golden(case):
    if case.get("skip"):
        pytest.skip("no golden cases yet — add to tests/golden/rater/")


@pytest.mark.eval
def test_rater_output_schema():
    """Verify rater agent exports output_key='risk_rating' with required fields."""
    from agents.credit_memo_commercial.rater import rater_agent
    assert rater_agent.output_key == "risk_rating", (
        f"Expected output_key='risk_rating', got '{rater_agent.output_key}'"
    )


@pytest.mark.eval
def test_rater_tools_wired():
    """All 6 atomic service tools must be present in the rater agent's tool list."""
    from agents.credit_memo_commercial.rater import rater_agent
    tool_names = {t.name for t in rater_agent.tools}
    expected = {
        "call_dscr_calculator",
        "call_covenant_analyzer",
        "call_peer_benchmarker",
        "call_industry_risk_scorer",
        "call_collateral_valuator",
        "call_exposure_aggregator",
    }
    missing = expected - tool_names
    assert not missing, f"Rater agent missing tools: {missing}"


@pytest.mark.eval
def test_rater_approved_model():
    """Rater must use claude-opus-4-7 (approved for reasoning agents)."""
    from agents.credit_memo_commercial.rater import rater_agent
    model_id = str(rater_agent.model)
    assert "claude-opus-4-7" in model_id, (
        f"Rater uses unapproved model: {model_id}"
    )
