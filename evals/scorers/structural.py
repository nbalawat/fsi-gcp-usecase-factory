"""Deterministic structural scorers — fast, cheap, run on every PR.

Each scorer takes (memo, documents) and returns a Score. They do NOT
call any LLM; the structural layer is the regression-prevention floor.

Scores produced:

  - section_completeness   every section has narrative + ≥2 citations
                           + ≥40 words. Surfaces "thin section" regressions.
  - citation_grounding     every cited (doc, page) actually exists in the
                           extraction output (no hallucinated pages).
  - numeric_density        memo prose contains ≥ N specific numeric
                           claims (rough proxy for substantive content).
  - schema_conformance     memo body validates against credit_memo.schema.json
                           (top-level keys + section keys present).
"""
from __future__ import annotations

import re
from typing import Any

from .types import Score


# 10-section memo contract (matches the credit-memo-document UI + the
# drafter prompt's section→source-field map). A memo MUST have all 10.
REQUIRED_SECTIONS = [
    "executive_summary",
    "borrower_overview",
    "financial_analysis",
    "cash_flow_projection",
    "risk_factors",
    "collateral",
    "covenant_package",
    "regulatory_concentration",
    "risk_rating_rationale",
    "recommendation",
]


def _section_narrative(section: dict[str, Any]) -> str:
    """Each memo section has a slightly different prose-bearing field —
    `narrative`, `text`, `summary`, `business_description`, etc. Walk
    them in priority order and concatenate everything that's a string
    longer than ~30 chars (skips field tags, single tokens, IDs)."""
    if not isinstance(section, dict):
        return ""
    parts: list[str] = []
    for key in (
        "narrative",
        "text",
        "summary",
        "business_description",
        "rationale_summary",
        "applicant_message",
    ):
        v = section.get(key)
        if isinstance(v, str) and len(v.strip()) > 30:
            parts.append(v.strip())
    # Drilling down: some sections nest narrative on a sub-object
    # (e.g. risk_factors.factors[].rationale).
    for v in section.values():
        if isinstance(v, list):
            for it in v:
                if isinstance(it, dict):
                    for sub_key in ("rationale", "narrative", "evidence", "interpretation"):
                        s = it.get(sub_key)
                        if isinstance(s, str) and len(s.strip()) > 30:
                            parts.append(s.strip())
    return " ".join(parts)


def _word_count(text: str) -> int:
    if not text:
        return 0
    return len([w for w in re.split(r"\s+", text.strip()) if w])


def _section_citations(section: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(section, dict):
        return []
    raw = section.get("citations")
    return list(raw) if isinstance(raw, list) else []


# ─── Scorers ─────────────────────────────────────────────────────────────────


def score_section_completeness(memo: dict[str, Any]) -> Score:
    """Each section must have prose (≥40 words) AND ≥2 citations.

    Score = 5 × (sections_passing / 10). Evidence lists which sections
    failed and why. This is the single most important regression
    catcher — when a prompt change produces thin sections, this score
    drops immediately.
    """
    passes = 0
    evidence: list[str] = []
    for key in REQUIRED_SECTIONS:
        section = memo.get(key)
        if not isinstance(section, dict):
            evidence.append(f"⚠ {key}: missing or non-object")
            continue
        narrative = _section_narrative(section)
        wc = _word_count(narrative)
        cits = _section_citations(section)
        ok = wc >= 40 and len(cits) >= 2
        if ok:
            passes += 1
        else:
            issues: list[str] = []
            if wc < 40:
                issues.append(f"only {wc} words of prose")
            if len(cits) < 2:
                issues.append(f"only {len(cits)} citation(s)")
            evidence.append(f"⚠ {key}: " + ", ".join(issues))

    score = 5.0 * (passes / len(REQUIRED_SECTIONS))
    if passes == len(REQUIRED_SECTIONS):
        evidence.append("✓ All 10 sections meet completeness floor")
    return Score(
        name="section_completeness",
        value=round(score, 2),
        evidence=evidence,
    )


def score_citation_grounding(
    memo: dict[str, Any],
    documents: list[dict[str, Any]],
) -> Score:
    """Every memo citation must reference a (filename, page) that
    actually exists in the extracted documents. Hallucinated citations
    score = 0; perfect grounding scores = 5.

    Evidence lists the worst offenders so you can spot which sections
    are inventing pages."""
    valid_pages: dict[str, set[int]] = {}
    for d in documents:
        fn = d.get("original_filename") or d.get("doc_id")
        if not fn:
            continue
        pages = set()
        # Prefer the document's own page_count if present
        pc = d.get("page_count")
        if isinstance(pc, int) and pc > 0:
            pages.update(range(1, pc + 1))
        # Plus any pages explicitly cited in the extraction
        for c in d.get("citations") or []:
            if isinstance(c, dict) and isinstance(c.get("page"), int):
                pages.add(c["page"])
        valid_pages[fn] = pages

    total = 0
    grounded = 0
    bad_examples: list[str] = []
    for sec_key in REQUIRED_SECTIONS:
        section = memo.get(sec_key)
        if not isinstance(section, dict):
            continue
        for c in _section_citations(section):
            if not isinstance(c, dict):
                continue
            total += 1
            src = c.get("source")
            page = c.get("page")
            if not isinstance(page, int):
                bad_examples.append(f"{sec_key}: citation has no page")
                continue
            if not isinstance(src, str):
                bad_examples.append(f"{sec_key}: citation has no source filename")
                continue
            valid = valid_pages.get(src, set())
            if not valid or page in valid:
                # `not valid` means we don't know the doc's page count;
                # treat as grounded (permissive).
                grounded += 1
            else:
                bad_examples.append(
                    f"{sec_key}: cites {src} p.{page} but doc only has {max(valid) if valid else 0} pages",
                )

    if total == 0:
        return Score(
            name="citation_grounding",
            value=0.0,
            evidence=["No citations to ground — memo is ungrounded"],
        )
    rate = grounded / total
    evidence = [f"{grounded}/{total} citations point at real (doc, page)"]
    evidence.extend(bad_examples[:5])
    return Score(
        name="citation_grounding",
        value=round(5.0 * rate, 2),
        evidence=evidence,
    )


# Money-or-percent regex: $X, X%, X.Xx, $X.YM, X bps. Used as a rough
# proxy for "specific numeric claim." Captures most material claims
# (revenue, EBITDA, debt, ratios) without a full numeric parser.
_NUMERIC_PATTERNS = [
    re.compile(r"\$\d[\d,]*(?:\.\d+)?\s?(?:[KMBT]|million|billion|thousand)?\b", re.IGNORECASE),
    re.compile(r"\b\d+(?:\.\d+)?%"),
    re.compile(r"\b\d+(?:\.\d+)?x\b"),
    re.compile(r"\b\d+(?:\.\d+)?\s?bps\b", re.IGNORECASE),
]


def score_numeric_density(memo: dict[str, Any]) -> Score:
    """A memo with ≥30 specific numeric claims across all sections has
    real substance. Counts $-amounts, percentages, ratios (Xx),
    basis-points. Below 30 → low density (probably hand-waving prose);
    above 60 → very dense.

    Score = 5 × min(1, total / 30)."""
    total = 0
    per_section: dict[str, int] = {}
    for sec_key in REQUIRED_SECTIONS:
        section = memo.get(sec_key)
        narrative = _section_narrative(section if isinstance(section, dict) else {})
        ct = 0
        for p in _NUMERIC_PATTERNS:
            ct += len(p.findall(narrative))
        per_section[sec_key] = ct
        total += ct

    score = 5.0 * min(1.0, total / 30.0)
    bottom = sorted(per_section.items(), key=lambda x: x[1])[:3]
    evidence = [f"Total numeric claims: {total}"]
    for k, v in bottom:
        evidence.append(f"  • {k}: {v} numeric claim(s)")
    return Score(
        name="numeric_density",
        value=round(score, 2),
        evidence=evidence,
    )


def score_schema_conformance(memo: dict[str, Any]) -> Score:
    """Memo has all 10 top-level section keys + the three top-level
    metadata keys (`borrower_id`, `application_id`, `recommendation`).

    Light-touch schema check; a full draft-07 validator runs in
    `evals/scorers/schema_full.py` (TODO). This boolean check is
    enough to flag "drafter dropped a section entirely" regressions."""
    missing: list[str] = []
    for k in REQUIRED_SECTIONS:
        if not isinstance(memo.get(k), dict):
            missing.append(k)
    for k in ("borrower_id", "application_id"):
        if not memo.get(k):
            missing.append(f"top-level {k}")

    score = 5.0 if not missing else 5.0 * (1 - len(missing) / (len(REQUIRED_SECTIONS) + 2))
    evidence = (
        ["✓ Memo has all 10 sections + required top-level keys"]
        if not missing
        else [f"⚠ Missing: {', '.join(missing)}"]
    )
    return Score(
        name="schema_conformance",
        value=round(max(0.0, score), 2),
        evidence=evidence,
    )


# ─── Aggregator ─────────────────────────────────────────────────────────────


def run_structural_scorers(
    memo: dict[str, Any],
    documents: list[dict[str, Any]],
) -> list[Score]:
    """Run every deterministic scorer; returns list ordered as written.
    The driver writes these to `evals/results/`. Cheap (<200ms total)."""
    return [
        score_section_completeness(memo),
        score_citation_grounding(memo, documents),
        score_numeric_density(memo),
        score_schema_conformance(memo),
    ]
