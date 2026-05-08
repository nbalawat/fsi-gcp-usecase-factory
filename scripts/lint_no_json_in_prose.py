#!/usr/bin/env python3
"""Rules 8, 9 — never dump intermediate state into user-facing fields.

Greps `services/orchestrator-*/main.py` and `usecases/<uc>/agents/*.py`
for any expression of the form

    <var>["text"|"narrative"|"summary"|"description"|"body"|"message"] = json.dumps(...)
    <var>["text"...] = str(<dict-or-list>)
    <var>["text"...] = ... + json.dumps(...)
    narrative = json.dumps(...)
    narrative = ...[: NNNN]                    # truncation on banker-readable

Any match fails the build with the file:line and a pointer to rule #8.

Allowed exceptions: a comment `# rule-8-exception: <reason>` on the same
line whitelists the match.

Usage:
    python3 scripts/lint_no_json_in_prose.py usecases/credit-memo-commercial/
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

BANKER_FIELDS = ("text", "narrative", "summary", "description", "body", "message", "evidence", "rationale")

# Pattern A: assignment to a banker-readable field with json.dumps on RHS
PAT_A = re.compile(
    rf'\[\s*["\']({"|".join(BANKER_FIELDS)})["\']\s*\]\s*=\s*[^#\n]*\bjson\s*\.\s*dumps\s*\('
)
# Pattern B: variable named like a banker-readable field assigned json.dumps
PAT_B = re.compile(
    rf'\b({"|".join(BANKER_FIELDS)})\s*=\s*[^#\n]*\bjson\s*\.\s*dumps\s*\('
)
# Pattern C: truncation [:NNNN] of a banker-readable variable
PAT_C = re.compile(
    rf'\b({"|".join(BANKER_FIELDS)})\s*=\s*[^#\n]*\[\s*:\s*\d{{3,}}\s*\]'
)


def scan_file(path: Path) -> list[tuple[int, str, str]]:
    findings: list[tuple[int, str, str]] = []
    try:
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            stripped = line.strip()
            if "# rule-8-exception" in stripped or "# rule-9-exception" in stripped:
                continue
            if PAT_A.search(line):
                findings.append((n, "rule-8/9", line.strip()))
            elif PAT_B.search(line):
                findings.append((n, "rule-8/9", line.strip()))
            elif PAT_C.search(line):
                findings.append((n, "rule-10", line.strip()))
    except (OSError, UnicodeDecodeError):
        pass
    return findings


def main(uc_path: Path) -> int:
    repo = uc_path.parent.parent
    targets = list((repo / "services").glob("orchestrator-*/main.py")) + list(
        (uc_path / "agents").glob("*.py")
    )
    if (uc_path / "handler" / "main.py").exists():
        targets.append(uc_path / "handler" / "main.py")

    total = 0
    for f in targets:
        for n, rule, src in scan_file(f):
            print(f"[{rule}] {f.relative_to(repo)}:{n}  {src[:120]}")
            total += 1
    if total:
        print(f"\n[fail] {total} occurrences of json-in-prose / truncation-on-prose.")
        print("Fix per docs/methodology/product-build-discipline.md rules 8, 9, 10.")
        return 1
    print("OK rules 8, 9, 10: no json-in-prose / no truncation on banker-readable fields.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <usecases/<uc>/>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1]).resolve()))
