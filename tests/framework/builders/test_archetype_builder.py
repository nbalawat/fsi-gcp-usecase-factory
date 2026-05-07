"""archetype-builder contract tests."""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from harness.claude_runner import run_builder_contract, run_builder_llm
from harness.findings_parser import Severity
from harness.tree_snapshot import snapshot_tree


BUILDER = "archetype-builder"
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "archetype_builder"


def _all_cases() -> list[Path]:
    return sorted(d for d in FIXTURES_DIR.iterdir() if d.is_dir())


def _load_spec(case: Path) -> dict:
    return yaml.safe_load((case / "SPEC.yaml").read_text())


@pytest.mark.parametrize("case", _all_cases(), ids=lambda p: p.name)
def test_golden_passes_validator(case: Path) -> None:
    spec = _load_spec(case)
    golden = case / "golden_output"
    findings = run_builder_contract(BUILDER, golden, spec)
    blockers = findings.by_severity(Severity.BLOCKER)
    assert not blockers, (
        f"golden tree at {golden} fails agent-validator: "
        f"{[(f.rule, f.file) for f in blockers]}"
    )


@pytest.mark.llm
@pytest.mark.parametrize("case", _all_cases(), ids=lambda p: p.name)
def test_builder_output_passes_validator(case: Path, tmp_path: Path) -> None:
    spec = _load_spec(case)
    work = tmp_path / "produced"
    run_builder_llm(BUILDER, spec, work)
    findings = run_builder_contract(BUILDER, work, spec)
    blockers = findings.by_severity(Severity.BLOCKER)
    assert not blockers, (
        f"builder output failed validator: {[(f.rule, f.file) for f in blockers]}"
    )

    actual_paths = {l.split()[0] for l in snapshot_tree(work).splitlines() if l.strip()}
    golden_paths = {l.split()[0] for l in snapshot_tree(case / "golden_output").splitlines() if l.strip()}
    missing = golden_paths - actual_paths
    assert not missing, f"builder output missing files vs golden: {sorted(missing)}"
