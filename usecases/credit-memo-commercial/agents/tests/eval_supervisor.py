"""Eval suite for credit-memo supervisor. pytest -m eval to run (requires model)."""
import json, pytest
from pathlib import Path

GOLDEN_DIR = Path(__file__).parent / "golden" / "supervisor"


def load_cases():
    return [json.loads(f.read_text()) for f in GOLDEN_DIR.glob("*.json")] if GOLDEN_DIR.exists() else []


@pytest.mark.eval
@pytest.mark.parametrize("case", load_cases() or [{"skip": True}])
async def test_supervisor_golden(case):
    if case.get("skip"):
        pytest.skip("no golden cases yet — add to tests/golden/supervisor/")


@pytest.mark.eval
def test_supervisor_has_all_specialists():
    """Supervisor must wire extractor, rater, and drafter as AgentTool."""
    from agents.credit_memo_commercial.supervisor import supervisor
    from google.adk.tools import AgentTool
    agent_tools = [t for t in supervisor.tools if isinstance(t, AgentTool)]
    wired_names = {t.agent.name for t in agent_tools}
    required = {"extractor", "rater", "drafter"}
    missing = required - wired_names
    assert not missing, f"Supervisor missing specialists: {missing}"


@pytest.mark.eval
def test_supervisor_memory_scope():
    """Supervisor must declare memory_scope for borrower-scoped context."""
    from agents.credit_memo_commercial.supervisor import supervisor
    assert hasattr(supervisor, "memory_scope") and supervisor.memory_scope, (
        "Supervisor must declare a memory_scope (e.g. 'borrower')"
    )


@pytest.mark.eval
def test_supervisor_approved_model():
    """Supervisor must use claude-opus-4-7."""
    from agents.credit_memo_commercial.supervisor import supervisor
    model_id = str(supervisor.model)
    assert "claude-opus-4-7" in model_id, (
        f"Supervisor uses unapproved model: {model_id}"
    )
