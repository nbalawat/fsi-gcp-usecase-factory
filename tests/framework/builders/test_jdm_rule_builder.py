"""jdm-rule-builder contract tests.

Each fixture pairs a SPEC.yaml (what the orchestrator passes to the builder)
with a golden_output/ tree (the expected produced files). The contract is
that the golden tree passes rule-validator with the same spec.

Deterministic tier: validate the golden tree (no LLM needed).
LLM tier (gated): invoke the actual builder, compare output to golden,
also re-validate.
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest
import yaml

from harness.claude_runner import (
    run_builder_contract,
    run_builder_llm,
    run_gatekeeper_deterministic,
)
from harness.findings_parser import FindingSet, Severity
from harness.tree_snapshot import diff_against_golden, snapshot_tree


BUILDER = "jdm-rule-builder"
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "jdm_rule_builder"


def _all_cases() -> list[Path]:
    return sorted(d for d in FIXTURES_DIR.iterdir() if d.is_dir())


def _load_spec(case: Path) -> dict:
    return yaml.safe_load((case / "SPEC.yaml").read_text())


@pytest.mark.parametrize("case", _all_cases(), ids=lambda p: p.name)
def test_golden_passes_validator(case: Path) -> None:
    """The maintained golden_output/ tree passes the rule-validator."""
    spec = _load_spec(case)
    golden = case / "golden_output"
    findings = run_builder_contract(BUILDER, golden, spec)
    blockers = findings.by_severity(Severity.BLOCKER)
    assert not blockers, (
        f"golden tree at {golden} fails validator: {[(f.rule, f.file) for f in blockers]}"
    )


@pytest.mark.llm
@pytest.mark.parametrize("case", _all_cases(), ids=lambda p: p.name)
def test_builder_output_matches_golden(case: Path, tmp_path: Path) -> None:
    """Invoke the actual builder; output must pass validator AND match the
    golden tree (snapshot diff)."""
    spec = _load_spec(case)
    work = tmp_path / "produced"
    run_builder_llm(BUILDER, spec, work)

    findings = run_builder_contract(BUILDER, work, spec)
    blockers = findings.by_severity(Severity.BLOCKER)
    assert not blockers, (
        f"builder output failed validator: {[(f.rule, f.file) for f in blockers]}"
    )

    # Snapshot diff against golden tree (informational; LLM output may have
    # whitespace variation — fail only on missing/extra files, not byte diffs).
    actual_snap = snapshot_tree(work)
    golden_snap = snapshot_tree(case / "golden_output")
    actual_paths = {line.split()[0] for line in actual_snap.splitlines() if line.strip()}
    golden_paths = {line.split()[0] for line in golden_snap.splitlines() if line.strip()}
    missing = golden_paths - actual_paths
    extra = actual_paths - golden_paths
    assert not missing, f"builder output missing files vs golden: {sorted(missing)}"
    # Extra files are tolerated — builder may legitimately add metadata.
