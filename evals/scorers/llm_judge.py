"""LLM-as-judge scorers using Vertex Gemini Pro.

Each rubric is a markdown prompt under evals/prompts/. The scorer
loads the rubric, sends (memo + document excerpts) to Gemini Pro with
response_mime_type="application/json", parses the result, returns a
Score.

Cost: ~$0.05 per (case × rubric) on Gemini 2.5 Pro at typical memo
sizes (5-10K input tokens + ~500 output tokens). The driver caps total
eval cost via the --max-cost flag.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .types import Score


_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _excerpt_documents(documents: list[dict[str, Any]], chars_per_doc: int = 4000) -> str:
    """Build a text bundle of per-document excerpts for the judge.

    The judge needs to see what kind of texture the source documents
    contain — subsidiaries, segments, named customers — so it can
    fairly score whether the memo captured it. We pass the first
    chars_per_doc characters of each doc's raw_markdown plus the doc's
    extracted_fields summary.
    """
    chunks: list[str] = []
    for d in documents:
        fn = d.get("original_filename", d.get("doc_id", "?"))
        dt = d.get("doc_type", "?")
        chunks.append(f"\n## {dt} · {fn}\n")
        # Structured fields summary
        ef = d.get("extracted_fields") or {}
        if ef:
            top_keys = sorted(ef.keys())
            chunks.append("Extracted top-level keys: " + ", ".join(top_keys))
        # Per-doc raw markdown excerpt — this is where the texture lives
        rm = d.get("raw_markdown") or ""
        if rm:
            chunks.append("\nFirst portion of document text:\n")
            chunks.append(rm[:chars_per_doc])
    return "\n".join(chunks)


def score_depth(
    memo: dict[str, Any],
    documents: list[dict[str, Any]],
    *,
    project: str | None = None,
    region: str = "us-central1",
    model: str = "gemini-2.5-pro",
) -> Score:
    """Run the depth rubric. Returns Score(value=1-5).

    Side effects: makes one Vertex Gemini call (~$0.05). When
    EVALS_DRY_RUN=1 is set, returns a stub Score without calling the
    model — useful in CI for plumbing tests.
    """
    if os.environ.get("EVALS_DRY_RUN") == "1":
        return Score(
            name="depth_llm",
            value=3.0,
            evidence=["DRY_RUN — no LLM call"],
            cost_usd=0.0,
        )

    rubric = (_PROMPTS_DIR / "judge_depth.md").read_text()
    excerpt_bundle = _excerpt_documents(documents)

    user_payload = {
        "memo": memo,
        "document_excerpts": excerpt_bundle,
    }

    # Lazy-import so non-eval code paths don't pull in vertexai
    from google import genai
    from google.genai import types as genai_types

    project = project or os.environ.get("GCP_PROJECT")
    if not project:
        raise RuntimeError("GCP_PROJECT env var unset; required for Vertex Gemini")

    client = genai.Client(vertexai=True, project=project, location=region)
    resp = client.models.generate_content(
        model=model,
        contents=json.dumps(user_payload, default=str),
        config=genai_types.GenerateContentConfig(
            system_instruction=rubric,
            response_mime_type="application/json",
            temperature=0.1,
            # 4096 leaves headroom for the judge's evidence lists
            # (named entities + verbatim quotes can run long when the
            # memo is rich) without burning excessive output tokens on
            # a thin memo. Cost difference is ~$0.04 per call.
            max_output_tokens=4096,
        ),
    )

    raw = (resp.text or "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        return Score(
            name="depth_llm",
            value=0.0,
            evidence=[f"Judge returned non-JSON: {exc}", f"raw={raw[:200]}"],
            cost_usd=_estimate_cost(resp, model),
        )

    score_int = int(parsed.get("score", 0))
    score_int = max(1, min(5, score_int))

    evidence: list[str] = []
    rationale = parsed.get("rationale")
    if rationale:
        evidence.append(f"Judge rationale: {rationale}")
    named = parsed.get("named_entities_found") or []
    if named:
        evidence.append(f"Named entities ({len(named)}): {', '.join(map(str, named[:6]))}")
    quotes = parsed.get("verbatim_quotes_found") or []
    if quotes:
        evidence.append(f"Verbatim quotes ({len(quotes)})")
        for q in quotes[:2]:
            evidence.append(f"  • {str(q)[:120]}…")
    missed = parsed.get("missed_texture") or []
    for m in missed[:3]:
        evidence.append(f"⚠ Missed: {m}")
    strengths = parsed.get("strength_examples") or []
    for s in strengths[:2]:
        evidence.append(f"✓ Strength: {s}")

    return Score(
        name="depth_llm",
        value=float(score_int),
        evidence=evidence,
        cost_usd=_estimate_cost(resp, model),
    )


def _estimate_cost(resp: Any, model: str) -> float:
    """Gemini 2.5 Pro pricing as of 2026: $1.25 / M input + $10 / M output."""
    try:
        usage = getattr(resp, "usage_metadata", None) or {}
        in_tokens = getattr(usage, "prompt_token_count", 0) or 0
        out_tokens = getattr(usage, "candidates_token_count", 0) or 0
    except Exception:
        return 0.0
    return round((in_tokens / 1_000_000) * 1.25 + (out_tokens / 1_000_000) * 10.0, 5)
