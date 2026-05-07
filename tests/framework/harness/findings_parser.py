"""
Canonical findings shape — each gatekeeper test ultimately produces a FindingSet
that the test asserts against.

A Finding is severity + rule + file + (optional) line + (optional) message.
Both the deterministic-mode runner and the LLM-mode runner produce the same shape.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class Severity(str, Enum):
    BLOCKER = "BLOCKER"      # architecture-auditor / compliance-reviewer
    CRITICAL = "CRITICAL"    # security-reviewer
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    WARNING = "WARNING"
    NIT = "NIT"
    INFO = "INFO"

    @classmethod
    def is_blocking(cls, sev: "Severity") -> bool:
        return sev in (cls.BLOCKER, cls.CRITICAL, cls.HIGH)


@dataclass(frozen=True)
class Finding:
    severity: Severity
    rule: str               # e.g. "no_atomic_to_atomic_calls"
    file: str               # repo-relative path
    line: int | None = None
    message: str = ""

    def cites(self, expected_file: str, expected_rule: str | None = None) -> bool:
        """Does this finding cite the expected file (and optionally rule)?"""
        if not self.file.endswith(expected_file):
            return False
        if expected_rule and self.rule != expected_rule:
            return False
        return True


@dataclass
class FindingSet:
    findings: list[Finding] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.findings)

    def __iter__(self):
        return iter(self.findings)

    def by_severity(self, severity: Severity) -> list[Finding]:
        return [f for f in self.findings if f.severity == severity]

    def by_rule(self, rule: str) -> list[Finding]:
        return [f for f in self.findings if f.rule == rule]

    def cites_file(self, file_suffix: str) -> bool:
        return any(f.file.endswith(file_suffix) for f in self.findings)

    def has_blocking(self) -> bool:
        return any(Severity.is_blocking(f.severity) for f in self.findings)

    def add(self, finding: Finding) -> None:
        self.findings.append(finding)

    def to_json(self) -> str:
        return json.dumps(
            [
                {"severity": f.severity.value, "rule": f.rule, "file": f.file, "line": f.line, "message": f.message}
                for f in self.findings
            ],
            indent=2,
        )


# ── LLM output parser ─────────────────────────────────────────────────────

# The gatekeeper agents return findings in one of two shapes:
#  - architecture-auditor returns a JSON object with a `violations` array
#  - security-reviewer / compliance-reviewer return prose with severity tags
#
# The LLM-mode harness extracts findings from either shape into FindingSet.

_JSON_VIOLATIONS_RE = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL)


def parse_llm_response(response_text: str) -> FindingSet:
    """
    Parse a gatekeeper's LLM response into a FindingSet.

    Tries (in order):
    1. JSON code block with `violations` array (architecture-auditor shape)
    2. Prose with severity tags (CRITICAL/HIGH/MEDIUM/...) and file paths
    """
    fs = FindingSet()

    # 1. Try JSON code block
    json_match = _JSON_VIOLATIONS_RE.search(response_text)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            for v in data.get("violations", []):
                fs.add(Finding(
                    severity=Severity(v.get("severity", "INFO").upper()),
                    rule=v.get("rule", "unknown"),
                    file=v.get("file", ""),
                    line=v.get("line"),
                    message=v.get("description", ""),
                ))
            if fs.findings:
                return fs
        except (json.JSONDecodeError, ValueError):
            pass

    # 2. Prose-tag fallback — find each severity tag with a file path nearby
    sev_re = re.compile(
        r"\*?\*?(?P<sev>BLOCKER|CRITICAL|HIGH|MEDIUM|LOW|WARNING|NIT|INFO)\*?\*?"
        r"[^\n]{0,300}?(?P<file>[\w./_-]+\.(?:py|yaml|tf|json|md|sh|yml))"
        r"(?::(?P<line>\d+))?",
        re.IGNORECASE | re.MULTILINE,
    )
    for m in sev_re.finditer(response_text):
        try:
            sev = Severity(m.group("sev").upper())
        except ValueError:
            continue
        line_str = m.group("line")
        fs.add(Finding(
            severity=sev,
            rule="prose-extracted",
            file=m.group("file"),
            line=int(line_str) if line_str else None,
            message=response_text[max(0, m.start() - 20):m.start() + 200],
        ))

    return fs
