"""Compliance-reviewer tests."""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from harness.claude_runner import run_gatekeeper_deterministic, run_gatekeeper_llm
from harness.findings_parser import FindingSet, Severity


GATEKEEPER = "compliance-reviewer"
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "compliance_reviewer"


def _all_scenarios() -> list[Path]:
    return sorted(d for d in FIXTURES_DIR.iterdir() if d.is_dir())


def _load_manifest(scenario: Path) -> dict:
    return yaml.safe_load((scenario / "MANIFEST.yaml").read_text())


def _assert_meets_expectations(findings: FindingSet, expects: dict) -> None:
    if expects.get("verdict") == "PASS":
        blockers = findings.by_severity(Severity.BLOCKER)
        max_findings = expects.get("findings_count_max", 0)
        assert len(blockers) == 0, f"unexpected BLOCKERs on clean fixture: {[f.rule for f in blockers]}"
        assert len(findings) <= max_findings, (
            f"expected ≤{max_findings} findings, got {len(findings)}: {findings.to_json()}"
        )
        return

    expected_rule = expects.get("rule")
    expected_file = expects.get("cite_file")
    expected_severity = expects.get("severity")
    expected_message_substring = expects.get("message_contains", "")

    matching = [
        f for f in findings
        if (not expected_rule or f.rule == expected_rule)
        and (not expected_file or f.file.endswith(expected_file))
    ]
    assert matching, (
        f"expected finding (rule={expected_rule}, file={expected_file}) not found.\n"
        f"all findings: {findings.to_json()}"
    )

    if expected_severity:
        assert any(f.severity.value == expected_severity for f in matching), (
            f"expected severity={expected_severity}, got {[f.severity.value for f in matching]}"
        )

    if expected_message_substring:
        assert any(expected_message_substring in f.message for f in matching), (
            f"expected message to contain {expected_message_substring!r}; "
            f"got messages: {[f.message[:100] for f in matching]}"
        )


@pytest.mark.parametrize("scenario", _all_scenarios(), ids=lambda p: p.name)
def test_deterministic(scenario: Path) -> None:
    manifest = _load_manifest(scenario)
    findings = run_gatekeeper_deterministic(GATEKEEPER, scenario)
    _assert_meets_expectations(findings, manifest["expects"])


@pytest.mark.llm
@pytest.mark.parametrize("scenario", _all_scenarios(), ids=lambda p: p.name)
def test_llm(scenario: Path) -> None:
    manifest = _load_manifest(scenario)
    findings = run_gatekeeper_llm(GATEKEEPER, scenario)
    _assert_meets_expectations(findings, manifest["expects"])
