#!/usr/bin/env python3
"""Rule 28 — every rule in product-build-discipline.md is paired with a CI gate.

Parses the lessons doc, finds every `**CI gate.**` section, and reports:
  - rules with no gate (aspirational backlog items)
  - rules whose gate is N/A or "aspirational"

Exits 0 when the doc's structural integrity is intact (every rule has a
CI gate paragraph, even if marked aspirational). Exits 1 only when a rule
has no `**CI gate.**` paragraph at all.

Usage:
    python3 scripts/lint_lessons_have_gates.py docs/methodology/product-build-discipline.md
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def main(doc: Path) -> int:
    if not doc.exists():
        print(f"[fatal] {doc} does not exist")
        return 2

    text = doc.read_text(encoding="utf-8")
    # Find every `## N. <Title>` heading and the chunk until the next `## ` or EOF
    rule_pat = re.compile(r"^##\s+(\d+)\.\s+(.+?)$", re.MULTILINE)
    rules: list[tuple[str, str, str]] = []  # (number, title, body)
    matches = list(rule_pat.finditer(text))
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        rules.append((m.group(1), m.group(2).strip(), text[m.end(): end]))

    if not rules:
        print(f"[fail] no rules found in {doc} — expected `## <N>. Title`")
        return 1

    no_gate: list[str] = []
    aspirational: list[str] = []
    real_gates: list[str] = []
    for num, title, body in rules:
        ci_section = re.search(r"\*\*CI gate\.\*\*\s*([^\n].*?)(?=\n\n|\Z)", body, re.DOTALL)
        if not ci_section:
            no_gate.append(f"{num}. {title}")
            continue
        gate_text = ci_section.group(1).strip().lower()
        if gate_text.startswith("n/a") or "aspirational" in gate_text or "not yet gated" in gate_text:
            aspirational.append(f"{num}. {title}")
        else:
            real_gates.append(f"{num}. {title}")

    print(f"Lessons doc: {doc}")
    print(f"  rules total:       {len(rules)}")
    print(f"  with real gate:    {len(real_gates)}")
    print(f"  aspirational:      {len(aspirational)}")
    print(f"  missing gate:      {len(no_gate)}")
    if aspirational:
        print("\nASPIRATIONAL (track as backlog):")
        for r in aspirational:
            print(f"  - {r}")
    if no_gate:
        print("\nMISSING (must add `**CI gate.**` paragraph):")
        for r in no_gate:
            print(f"  - {r}")
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <product-build-discipline.md>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1]).resolve()))
