"""service-validator tests — same shape as the gatekeeper tests.

Each fixture under fixtures/service_validator/ has a MANIFEST.yaml whose
`spec:` block carries the operation spec the validator would normally
receive from the parallel-build orchestrator.
"""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from harness.claude_runner import run_gatekeeper_deterministic, run_gatekeeper_llm
from harness.findings_parser import FindingSet, Severity


VALIDATOR = "service-validator"
FIXTURES_DIR = Path(__file__).parent / "fixtures" / "service_validator"


def _all_scenarios() -> list[Path]:
    return sorted(d for d in FIXTURES_DIR.iterdir() if d.is_dir())


def _load_manifest(scenario: Path) -> dict:
    return yaml.safe_load((scenario / "MANIFEST.yaml").read_text())


def _assert_meets_expectations(findings: FindingSet, expects: dict) -> None:
    if expects.get("verdict") == "PASS":
        blockers = findings.by_severity(Severity.BLOCKER)
        criticals = findings.by_severity(Severity.CRITICAL)
        max_findings = expects.get("findings_count_max", 0)
        assert len(blockers) == 0, f"unexpected BLOCKERs: {[f.rule for f in blockers]}"
        assert len(criticals) == 0, f"unexpected CRITICALs: {[f.rule for f in criticals]}"
        assert len(findings) <= max_findings, (
            f"expected ≤{max_findings} findings, got {len(findings)}: {findings.to_json()}"
        )
        return

    expected_rule = expects.get("failing_check")
    expected_file = expects.get("cite_file")
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

    if expected_message_substring:
        assert any(expected_message_substring in f.message for f in matching), (
            f"expected message containing {expected_message_substring!r}; "
            f"got: {[f.message[:100] for f in matching]}"
        )


@pytest.mark.parametrize("scenario", _all_scenarios(), ids=lambda p: p.name)
def test_deterministic(scenario: Path) -> None:
    manifest = _load_manifest(scenario)
    findings = run_gatekeeper_deterministic(VALIDATOR, scenario, manifest.get("spec"))
    _assert_meets_expectations(findings, manifest["expects"])


@pytest.mark.llm
@pytest.mark.parametrize("scenario", _all_scenarios(), ids=lambda p: p.name)
def test_llm(scenario: Path) -> None:
    manifest = _load_manifest(scenario)
    findings = run_gatekeeper_llm(VALIDATOR, scenario)
    _assert_meets_expectations(findings, manifest["expects"])
