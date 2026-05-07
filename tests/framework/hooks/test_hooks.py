"""
Hook tests — verify shell hooks parse, execute deterministically, and
respond correctly to fixture inputs.

Two hooks today:
  pre-commit-arch-audit.sh — refuses commits that fail the architecture audit
  session-start-context.sh — emits the banner with active use case context

Tests check:
  - File exists, executable, parses as bash (`bash -n`)
  - shellcheck clean (skipped if shellcheck not installed)
  - session-start runs against a synthetic monorepo fixture and emits the
    expected banner shape
  - pre-commit hook handles the no-staged-files case (exits 0 cleanly)
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
HOOKS_DIR = REPO_ROOT / ".claude" / "hooks"

HOOK_SCRIPTS = [
    HOOKS_DIR / "pre-commit-arch-audit.sh",
    HOOKS_DIR / "session-start-context.sh",
]


@pytest.mark.parametrize("hook", HOOK_SCRIPTS, ids=lambda p: p.name)
def test_hook_exists_and_executable(hook: Path) -> None:
    assert hook.is_file(), f"hook missing: {hook}"
    # On macOS git checkout, the executable bit may not survive; check shebang
    first_line = hook.read_text().splitlines()[0]
    assert first_line.startswith("#!"), f"{hook.name} missing shebang"
    assert "bash" in first_line or "sh" in first_line, f"{hook.name} non-shell shebang: {first_line!r}"


@pytest.mark.parametrize("hook", HOOK_SCRIPTS, ids=lambda p: p.name)
def test_hook_bash_syntax_valid(hook: Path) -> None:
    """bash -n: parse-only, catches syntax errors without executing."""
    result = subprocess.run(
        ["bash", "-n", str(hook)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, (
        f"{hook.name} bash syntax error:\n{result.stderr}"
    )


@pytest.mark.parametrize("hook", HOOK_SCRIPTS, ids=lambda p: p.name)
@pytest.mark.skipif(shutil.which("shellcheck") is None, reason="shellcheck not installed")
def test_hook_shellcheck_clean(hook: Path) -> None:
    """shellcheck enforces shell best practices — quoting, exit codes, etc."""
    result = subprocess.run(
        ["shellcheck", "-S", "warning", str(hook)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, (
        f"{hook.name} shellcheck issues:\n{result.stdout}\n{result.stderr}"
    )


def test_session_start_emits_banner(tmp_path: Path) -> None:
    """Session-start hook against a synthetic monorepo fixture emits the banner."""
    # Build a minimal fixture
    (tmp_path / "portfolio.yaml").write_text("use_cases:\n  - id: test-uc\n    phase: intake\n")
    uc_dir = tmp_path / "usecases" / "test-uc"
    uc_dir.mkdir(parents=True)
    (uc_dir / "reasons.yaml").write_text("requirements:\n  description: test\n")
    (tmp_path / "services" / "atomic").mkdir(parents=True)
    (tmp_path / "services" / "atomic" / "x").mkdir()

    hook = HOOKS_DIR / "session-start-context.sh"
    result = subprocess.run(
        ["bash", str(hook)],
        capture_output=True, text=True,
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    # Hook should exit 0 even if some optional metadata is missing
    assert result.returncode == 0, f"session-start exited {result.returncode}:\n{result.stderr}"
    # Banner shape
    out = result.stdout
    assert "Agentic banking platform" in out, f"banner header missing in:\n{out}"
    assert "test-uc" in out or "Active use case" in out, (
        f"active use case not surfaced:\n{out}"
    )


def test_pre_commit_hook_handles_no_staged_files(tmp_path: Path) -> None:
    """pre-commit-arch-audit must exit 0 cleanly when no relevant files are staged."""
    # Initialise a git repo in tmp_path with no staged changes
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=tmp_path, check=True)

    hook = HOOKS_DIR / "pre-commit-arch-audit.sh"
    # Copy hook into the tmp repo so it has the right cwd
    hook_copy = tmp_path / "pre-commit-arch-audit.sh"
    hook_copy.write_text(hook.read_text())

    result = subprocess.run(
        ["bash", str(hook_copy)],
        cwd=tmp_path,
        capture_output=True, text=True,
    )
    # No relevant files staged → exit 0
    assert result.returncode == 0, (
        f"pre-commit hook should exit 0 with no staged files; got {result.returncode}:\n{result.stderr}"
    )
