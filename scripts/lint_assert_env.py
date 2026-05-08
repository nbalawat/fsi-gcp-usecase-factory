#!/usr/bin/env python3
"""Rule 20 — required env vars must hard-fail at boot.

Every service in the use case's `discipline_gates.required_env` block
must call a startup assertion (default name `_assert_env(...)`) before
serving traffic. Silent `os.environ.get(...)` for required vars is the
banned pattern that produced the "page is hung at Application Received"
incident.

Heuristic: file contains EITHER
    _assert_env([...])            # canonical helper
OR
    if not os.environ.get(VAR): raise / sys.exit(...)
for every variable listed in the gate.

Usage:
    python3 scripts/lint_assert_env.py services/orchestrator-credit-memo \\
        usecases/credit-memo-commercial/handler
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def has_boot_assertion(src: str, var: str) -> bool:
    """A file passes if it provides ANY of the recognized hard-fail patterns
    on the named env var:
      - _assert_env([..., "VAR", ...])
      - os.environ["VAR"]                  (raises KeyError on miss — hard fail)
      - if not os.environ.get("VAR"): raise / sys.exit
      - os.environ.get("VAR") or _raise(...)
    The shared rule: the program WILL stop if VAR is unset, not silently no-op.
    """
    # Canonical helper
    if re.search(rf'_assert_env\s*\(\s*\[[^\]]*["\']({re.escape(var)})["\']', src):
        return True
    # Bracket access — KeyError on miss
    if re.search(rf'os\.environ\s*\[\s*["\']({re.escape(var)})["\']\s*\]', src):
        return True
    # Required-with-raise pattern
    pat = re.search(
        rf'if\s+not\s+os\.environ\.get\(\s*["\']({re.escape(var)})["\']\s*\)\s*:',
        src,
    )
    if pat:
        window = src[pat.start(): pat.start() + 400]
        if "raise " in window or "sys.exit" in window or "SystemExit" in window:
            return True
    # `os.environ.get("VAR") or raise(...)` shorthand
    if re.search(
        rf'os\.environ\.get\(\s*["\']({re.escape(var)})["\']\s*\)\s*\|\|\s*(raise|_raise|sys\.exit)',
        src,
    ):
        return True
    return False


def main(*paths: str) -> int:
    if len(paths) < 1:
        print("usage: lint_assert_env.py <service-dir> [more...]", file=sys.stderr)
        return 2

    # Find each main.py and the closest reasons.yaml
    failed: list[tuple[str, list[str]]] = []
    for p in paths:
        root = Path(p).resolve()
        if root.is_dir():
            mains = list(root.glob("**/main.py"))
        else:
            mains = [root] if root.exists() else []
        for f in mains:
            if "tests" in f.parts or "__pycache__" in f.parts:
                continue
            # Walk up to find the nearest reasons.yaml
            uc_root = None
            for parent in f.parents:
                if (parent / "reasons.yaml").exists():
                    uc_root = parent
                    break
            if uc_root is None:
                # No use case — fall back to checking GCP_PROJECT and DB_USER
                required = ["GCP_PROJECT"]
            else:
                try:
                    import yaml
                    rc = yaml.safe_load((uc_root / "reasons.yaml").read_text())
                    gates = (rc or {}).get("discipline_gates") or {}
                    req_map = gates.get("required_env") or {}
                    # Find this service's name
                    svc_name = f.parent.name if f.parent.name != "handler" else uc_root.name
                    required = list(req_map.get(svc_name, ["GCP_PROJECT"]))
                except (ImportError, OSError):
                    required = ["GCP_PROJECT"]

            src = f.read_text(encoding="utf-8")
            missing = [v for v in required if not has_boot_assertion(src, v)]
            if missing:
                failed.append((str(f), missing))

    if failed:
        for f, miss in failed:
            print(f"[fail] {f}: missing _assert_env() for {miss}")
        print(f"\nFix: add _assert_env([...]) at module load, before any client init.")
        print("See docs/methodology/product-build-discipline.md rule 20.")
        return 1
    print("OK rule 20: required env vars hard-fail at boot.")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
