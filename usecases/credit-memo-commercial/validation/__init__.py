"""Validation gate for commercial credit memo applications.

This module decides whether an application's submitted document set is
complete enough to underwrite. It runs after the document-extractor has
processed every doc — `application_documents.extraction_status` is
either 'extracted' or 'failed' on every row.

The output is the contract the orchestrator (and eventually Cloud
Workflows) branches on:

  decision = "PROCEED"              → run Stage 3 (atomic services)
  decision = "RETURN_FOR_REVISION"  → write a return_notice artifact,
                                      set application_state.decision,
                                      publish .decided so sinks skip
                                      GL posting, render the
                                      ReturnedApplicationPanel.

Every input + output goes through Pydantic so a malformed payload
fails at the boundary, not five steps downstream.
"""
from .gate import (
    DocumentInput,
    MissingItem,
    ValidationDecision,
    ValidationInput,
    ValidationResult,
    evaluate_application_completeness,
)

__all__ = [
    "DocumentInput",
    "MissingItem",
    "ValidationDecision",
    "ValidationInput",
    "ValidationResult",
    "evaluate_application_completeness",
]
