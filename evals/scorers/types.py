"""Shared types for memo eval scorers.

Every scorer returns a Score: a numeric value in [0, 5] (or 0/1 for
boolean checks promoted to 0.0/5.0), plus evidence strings the operator
can read to understand WHY the score is what it is.

The driver aggregates Score objects into an EvalResult, which is the
JSON written to evals/results/.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class Score:
    """Output of a single scorer."""

    name: str
    """Stable identifier — e.g. 'section_completeness', 'depth_llm'. """

    value: float
    """0.0–5.0. Lower is worse. Boolean checks return 0.0 or 5.0."""

    evidence: list[str] = field(default_factory=list)
    """Human-readable bullets explaining the score — what was found,
    what was missing, what's good. Diff tools surface these. """

    cost_usd: float = 0.0
    """LLM-judge scorers report their token cost; deterministic ones report 0."""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class EvalResult:
    """Aggregate score across all scorers for a single application."""

    application_id: str
    borrower_id: str
    run_id: str
    """ISO timestamp at run start, sortable as a string."""

    git_sha: str | None
    """Optional — set by run_evals.py from `git rev-parse HEAD`. Used so
    eval_diff.py can pin scores to commits. """

    scores: list[Score] = field(default_factory=list)

    @property
    def average(self) -> float:
        if not self.scores:
            return 0.0
        return sum(s.value for s in self.scores) / len(self.scores)

    @property
    def total_cost_usd(self) -> float:
        return sum(s.cost_usd for s in self.scores)

    def as_dict(self) -> dict[str, Any]:
        return {
            "application_id": self.application_id,
            "borrower_id": self.borrower_id,
            "run_id": self.run_id,
            "git_sha": self.git_sha,
            "average": round(self.average, 2),
            "total_cost_usd": round(self.total_cost_usd, 4),
            "scores": [s.as_dict() for s in self.scores],
        }
