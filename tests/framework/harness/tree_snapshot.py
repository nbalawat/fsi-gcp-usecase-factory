"""
Byte-stable directory tree diff for golden-file tests.

Used by builder + skill tests: feed input spec, run the builder/skill,
compare the produced tree against an `expected_tree.txt` golden file.
"""
from __future__ import annotations

import hashlib
from pathlib import Path


_IGNORE_BASENAMES = {"__pycache__", ".pytest_cache", ".ruff_cache", ".mypy_cache", ".DS_Store"}


def snapshot_tree(root: Path) -> str:
    """
    Produce a deterministic textual snapshot of a directory tree:
      <relative-path>  <sha256-of-contents>  <byte-size>
    one line per file, sorted by path.
    """
    lines: list[str] = []
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(root)
        if any(part in _IGNORE_BASENAMES for part in rel.parts):
            continue
        h = hashlib.sha256(p.read_bytes()).hexdigest()[:16]
        lines.append(f"{rel}  {h}  {p.stat().st_size}")
    return "\n".join(lines) + "\n"


def diff_against_golden(actual_root: Path, golden_path: Path) -> tuple[bool, str]:
    """
    Compare snapshot_tree(actual_root) against the contents of golden_path.
    Returns (matched, diff_text).
    """
    actual = snapshot_tree(actual_root)
    if not golden_path.is_file():
        return False, f"golden missing at {golden_path}; actual:\n{actual}"
    expected = golden_path.read_text()
    if actual == expected:
        return True, ""
    # Produce a simple line-diff
    a_lines = set(actual.splitlines())
    e_lines = set(expected.splitlines())
    only_a = sorted(a_lines - e_lines)
    only_e = sorted(e_lines - a_lines)
    diff_parts = []
    if only_e:
        diff_parts.append("missing from actual:\n  " + "\n  ".join(only_e))
    if only_a:
        diff_parts.append("unexpected in actual:\n  " + "\n  ".join(only_a))
    return False, "\n\n".join(diff_parts)
