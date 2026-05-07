"""rule-validator tests."""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from harness.claude_runner import run_gatekeeper_deterministic, run_gatekeeper_llm
from harness.findings_parser import FindingSet, Severity


VALIDATOR = "rule-validator"
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "rule_validator"


def _all_scenarios() -> list[Path]:
    return sorted(d for d in FIXTURES_DIR.iterdir() if d.is_dir())


def _load_manifest(scenario: Path) -> dict:
    return yaml.safe_load((scenario / "MANIFEST.yaml").read_text())


def _assert(findings: FindingSet, expects: dict) -> None:
    if expects.get("verdict") == "PASS":
        blockers = findings.by_severity(Severity.BLOCKER)
        assert len(blockers) == 0, f"unexpected BLOCKERs: {[f.rule for f in blockers]}"
        assert len(findings) <= expects.get("findings_count_max", 0), (
            f"expected ≤{expects.get('findings_count_max', 0)} findings, got: {findings.to_json()}"
        )
        return
    rule = expects.get("failing_check")
    cite = expects.get("cite_file")
    msg = expects.get("message_contains", "")
    matching = [
        f for f in findings
        if (not rule or f.rule == rule) and (not cite or f.file.endswith(cite))
    ]
    assert matching, f"expected ({rule}, {cite}); got: {findings.to_json()}"
    if msg:
        assert any(msg in f.message for f in matching), (
            f"expected message containing {msg!r}; got: {[f.message[:100] for f in matching]}"
        )


@pytest.mark.parametrize("scenario", _all_scenarios(), ids=lambda p: p.name)
def test_deterministic(scenario: Path) -> None:
    manifest = _load_manifest(scenario)
    findings = run_gatekeeper_deterministic(VALIDATOR, scenario, manifest.get("spec"))
    _assert(findings, manifest["expects"])


@pytest.mark.llm
@pytest.mark.parametrize("scenario", _all_scenarios(), ids=lambda p: p.name)
def test_llm(scenario: Path) -> None:
    manifest = _load_manifest(scenario)
    findings = run_gatekeeper_llm(VALIDATOR, scenario)
    _assert(findings, manifest["expects"])
