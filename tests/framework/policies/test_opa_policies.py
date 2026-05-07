"""
OPA policy unit tests — runs the rego *_test.rego files via `opa test policies/`.

Skipped (with a clear message) if the `opa` binary isn't on PATH; available
on CI via the official OPA action or `brew install opa` locally.

The actual test cases live in policies/*_test.rego (encryption, iam,
networking, observability, tagging). Each policy file has both `deny` and
`warn` rules; tests cover positive (compliant input) and negative (violating
input) cases for each rule.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
POLICIES_DIR = REPO_ROOT / "policies"


def _opa_available() -> bool:
    return shutil.which("opa") is not None


@pytest.mark.skipif(not _opa_available(), reason="opa binary not on PATH; install with `brew install opa`")
def test_opa_policies_pass() -> None:
    """Run all rego *_test.rego files via `opa test policies/`."""
    result = subprocess.run(
        ["opa", "test", str(POLICIES_DIR), "-v"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"opa test failed:\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )


def test_every_policy_has_test_file() -> None:
    """Each policies/*.rego (excluding *_test.rego) must have a sibling _test.rego."""
    policies = [p for p in POLICIES_DIR.glob("*.rego") if not p.name.endswith("_test.rego")]
    missing = []
    for policy in policies:
        test_file = policy.parent / f"{policy.stem}_test.rego"
        if not test_file.is_file():
            missing.append(test_file.relative_to(REPO_ROOT))
    assert not missing, f"policies missing _test.rego sibling: {missing}"
