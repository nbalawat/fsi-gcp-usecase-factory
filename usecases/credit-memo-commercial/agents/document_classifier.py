"""
credit-memo-commercial document_classifier agent — cheap-classifier instantiation.

Classifies each uploaded borrower document into a controlled vocabulary so the
orchestrator can route extraction work to the correct downstream specialists.
Uses Gemini Flash because this is a high-volume, low-reasoning classification step.
"""
from __future__ import annotations
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.models import Gemini

PROMPT_DIR = Path(__file__).parent / "prompts"

document_classifier_agent = LlmAgent(
    name="credit_memo_document_classifier",
    model=Gemini("gemini-3-1-flash"),
    description="Classifies each uploaded borrower document into a controlled vocabulary (10-K, audited_financials, ar_aging, etc.) with confidence and a one-line summary.",
    instruction=(PROMPT_DIR / "document_classifier.md").read_text(),
    tools=[],
    memory_scope=None,
    output_key="classified_docs",
)
