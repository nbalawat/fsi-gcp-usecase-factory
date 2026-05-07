"""
Helper-script tests — bash syntax + shellcheck across scripts/*.sh.

Each script gets:
  - Existence + shebang sanity
  - `bash -n` parse-only (catches syntax errors)
  - shellcheck -S warning (catches quoting / portability issues; skipped if
    shellcheck isn't installed locally)

Run-time tests for individual scripts (e.g. validate_use_case dry-run on a
fixture) live next to the script's behavior, in tests/framework/scripts/
sub-modules.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _all_scripts() -> list[Path]:
    return sorted(SCRIPTS_DIR.glob("*.sh"))


@pytest.mark.parametrize("script", _all_scripts(), ids=lambda p: p.stem)
def test_script_exists_and_has_shebang(script: Path) -> None:
    assert script.is_file()
    first = script.read_text().splitlines()[0]
    assert first.startswith("#!"), f"{script.name} missing shebang"
    assert "bash" in first or "sh" in first


@pytest.mark.parametrize("script", _all_scripts(), ids=lambda p: p.stem)
def test_script_bash_syntax_valid(script: Path) -> None:
    """bash -n: parse-only sanity. Catches missing fi / done / brace issues."""
    result = subprocess.run(
        ["bash", "-n", str(script)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, (
        f"{script.name} bash syntax error:\n{result.stderr}"
    )


@pytest.mark.parametrize("script", _all_scripts(), ids=lambda p: p.stem)
@pytest.mark.skipif(shutil.which("shellcheck") is None, reason="shellcheck not installed")
def test_script_shellcheck_clean(script: Path) -> None:
    """shellcheck at warning level — catches quoting, exit-code, portability bugs."""
    result = subprocess.run(
        ["shellcheck", "-S", "warning", "-x", str(script)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, (
        f"{script.name} shellcheck issues:\n{result.stdout}\n{result.stderr}"
    )


# ── Behavior smoke tests ─────────────────────────────────────────────────

def test_lint_toolkit_runs_clean() -> None:
    """`scripts/lint_toolkit.sh` runs to completion against the current repo."""
    script = SCRIPTS_DIR / "lint_toolkit.sh"
    if not script.is_file():
        pytest.skip("lint_toolkit.sh not present")
    result = subprocess.run(
        ["bash", str(script)],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=120,
    )
    # Lint script may report some warnings but should not crash (exit 1+ is allowed
    # if there are real lint failures; we only assert it runs to completion).
    assert result.returncode in {0, 1}, (
        f"lint_toolkit crashed (exit {result.returncode}):\n{result.stderr[:500]}"
    )


def test_validate_use_case_handles_unknown_uc() -> None:
    """validate_use_case.sh on a non-existent UC must exit non-zero with a clear message."""
    script = SCRIPTS_DIR / "validate_use_case.sh"
    if not script.is_file():
        pytest.skip("validate_use_case.sh not present")
    result = subprocess.run(
        ["bash", str(script), "this-uc-does-not-exist"],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=30,
    )
    assert result.returncode != 0
    combined = (result.stderr + result.stdout).lower()
    assert "not found" in combined or "missing" in combined or "this-uc-does-not-exist" in combined, (
        f"expected clear error for unknown UC; got:\nstdout: {result.stdout[:300]}\nstderr: {result.stderr[:300]}"
    )
