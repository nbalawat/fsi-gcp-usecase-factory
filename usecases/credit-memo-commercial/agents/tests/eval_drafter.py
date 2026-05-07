"""Eval suite for drafter agent. pytest -m eval to run (requires model)."""
import json, pytest
from pathlib import Path

GOLDEN_DIR = Path(__file__).parent / "golden" / "drafter"

def load_cases():
    return [json.loads(f.read_text()) for f in GOLDEN_DIR.glob("*.json")] if GOLDEN_DIR.exists() else []

@pytest.mark.eval
@pytest.mark.parametrize("case", load_cases() or [{"skip": True}])
async def test_drafter_golden(case):
    if case.get("skip"):
        pytest.skip("no golden cases yet — add to tests/golden/drafter/")
