#!/usr/bin/env python3
"""Rule 2 — structured-output agents must set response_schema.

Reads `usecases/<uc>/reasons.yaml#discipline_gates.structured_output_agents`
and asserts that every listed role's call site in
`services/orchestrator-*/main.py` includes `response_schema=` in its
GenerateContentConfig.

Failure exits 1; on green prints `OK rule 2: N agents constrained`.

Usage:
    python3 scripts/lint_agent_calls.py usecases/credit-memo-commercial/
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("[fatal] pyyaml required: pip3 install --user pyyaml", file=sys.stderr)
    sys.exit(2)


def main(uc_path: Path) -> int:
    rc_path = uc_path / "reasons.yaml"
    if not rc_path.exists():
        print(f"[skip] no reasons.yaml at {rc_path}")
        return 0
    with rc_path.open() as f:
        rc = yaml.safe_load(f) or {}
    structured = (rc.get("discipline_gates") or {}).get("structured_output_agents", [])
    if not structured:
        print("[skip] no structured_output_agents declared")
        return 0

    repo = uc_path.parent.parent
    orchestrators = list((repo / "services").glob("orchestrator-*/main.py"))
    if not orchestrators:
        print(f"[fail] structured_output_agents declared but no orchestrator-*/main.py found")
        return 1

    failed: list[str] = []
    for role in structured:
        role_variants = {role, role.replace("-", "_"), role.replace("_", "-")}
        # Look for ANY conditional that mentions one of the role variants
        # AND has response_schema within the same lexical block (~1500 chars).
        found_constrained = False
        for orch in orchestrators:
            src = orch.read_text(encoding="utf-8")
            for variant in role_variants:
                # Catch role in ("a", "b", "c") — variant can be ANY position in the tuple
                pat = rf'role\s+in\s+\([^)]*?["\']({re.escape(variant)})["\']'
                for m in re.finditer(pat, src):
                    window = src[m.start(): m.start() + 1500]
                    if "response_schema" in window:
                        found_constrained = True
                        break
                if found_constrained:
                    break
                # Direct equality
                pat2 = rf'role\s*==\s*["\']({re.escape(variant)})["\']'
                for m in re.finditer(pat2, src):
                    window = src[m.start(): m.start() + 1500]
                    if "response_schema" in window:
                        found_constrained = True
                        break
                if found_constrained:
                    break
            if found_constrained:
                break
        if not found_constrained:
            failed.append(role)

    if failed:
        print(f"[fail] rule 2 — {len(failed)} structured_output_agents lack response_schema:")
        for r in failed:
            print(f"  - {r}")
        return 1
    print(f"OK rule 2: {len(structured)} agents constrained via response_schema")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <usecases/<uc>/>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1]).resolve()))
