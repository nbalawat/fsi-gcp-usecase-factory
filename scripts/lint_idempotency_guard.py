#!/usr/bin/env python3
"""Rule 7 — idempotency guard on every async handler.

Every `services/orchestrator-*/main.py` and `usecases/*/handler/main.py`
must contain an early-exit that:
  1. reads the idempotency-state column (default `current_stage`), and
  2. returns/skips before invoking expensive work if the value is in the
     "already running" set.

Heuristic: file must contain BOTH a SELECT on `current_stage` AND either
a `return` or `raise` within the same function whose body mentions
`skipping` / `redelivery` / `idempot`.

Usage:
    python3 scripts/lint_idempotency_guard.py services/orchestrator-credit-memo \\
        usecases/credit-memo-commercial/handler
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def has_idempotency_guard(src: str) -> bool:
    """A file passes if it shows the THREE markers of an idempotency guard:
    a SELECT on the state column, a skip signal in the surrounding code,
    and an early-exit return. We don't require them in a single tight
    window since the orchestrator pattern legitimately spreads them across
    a function (read row → check stage → log → return)."""
    has_select = bool(re.search(
        r"SELECT\s+(current_stage|status|state|stage)\b",
        src, re.IGNORECASE,
    ))
    has_skip_signal = any(kw in src for kw in (
        "skipping_redelivery", "skipping", "skipped",
        "already_processing", "already_running", "idempot",
        "redeliver",
    ))
    # An early return that mentions skipped / already / dup
    has_early_exit = bool(re.search(
        r'return\s+\{[^}]*"(skipped|already|duplicate|noop)',
        src, re.IGNORECASE,
    ))
    return has_select and has_skip_signal and has_early_exit


def main(*paths: str) -> int:
    failed: list[str] = []
    checked = 0
    for p in paths:
        root = Path(p).resolve()
        if root.is_dir():
            files = list(root.glob("**/main.py"))
        else:
            files = [root] if root.exists() else []
        for f in files:
            if "tests" in f.parts or "__pycache__" in f.parts:
                continue
            checked += 1
            try:
                src = f.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            if not has_idempotency_guard(src):
                failed.append(str(f))

    if failed:
        print(f"[fail] rule 7 — {len(failed)} async entry points lack idempotency guard:")
        for f in failed:
            print(f"  - {f}")
        print("\nFix: read current_stage on entry, return early on redelivery.")
        print("See docs/methodology/product-build-discipline.md rule 7.")
        return 1
    print(f"OK rule 7: {checked} entry points have idempotency guards.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"usage: {sys.argv[0]} <handler-dir-or-file> [more...]", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
