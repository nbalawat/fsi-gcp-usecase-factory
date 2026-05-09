"""Validation gate logic.

Reads application_completeness from document_requirements.json and
compares it against the actual set of submitted + extracted documents.
Produces a structured decision the orchestrator branches on.

Decision rules — three reasons an application returns for revision:

  1. APPLICATION_INCOMPLETE
     The submitted doc-types don't satisfy the loan-amount tier's
     `must_have` + `minimum_satisfied_by` constraints. Example: $50M
     loan submitted with only a 10-K (missing the required AR_aging).

  2. CRITICAL_FIELDS_MISSING
     The doc was extracted but its `missing_required_fields` includes
     a critical financial field per
     `completeness_severity.rules`. Example: a 10-K extracted without
     income_statement.revenue.

  3. EXTRACTION_FAILED
     A required document hit `extraction_status='failed'` (vendor 4xx,
     OCR mismatch, corrupt PDF). The applicant must re-upload it.

When the gate produces RETURN_FOR_REVISION, every missing item carries
a banker-readable `applicant_message` so the frontend can render an
actionable checklist without running the rules itself.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ── Data-driven config ──────────────────────────────────────────────────────


_REQUIREMENTS_PATH = (
    Path(__file__).resolve().parent.parent / "schemas" / "document_requirements.json"
)


def _load_requirements() -> dict[str, Any]:
    with _REQUIREMENTS_PATH.open() as f:
        return json.load(f)


_CRITICAL_FIELD_KEYWORDS = (
    "revenue",
    "ebitda",
    "net_income",
    "total_assets",
    "total_debt",
    "total_equity",
    "operating_cash_flow",
    "fiscal_year_end",
    "fiscal_period_end",
    "as_of_date",
    "auditor_name",
    "audit_opinion",
    "appraised_value",
    "meeting_date",
)


def _is_critical_field(field_path: str) -> bool:
    """A required field is 'critical' (block underwriting) if it carries
    enough financial signal that the rest of the analysis would be
    nonsense without it. The keyword list is the codified version of
    completeness_severity.rules in document_requirements.json."""
    return any(kw in field_path for kw in _CRITICAL_FIELD_KEYWORDS)


# ── Pydantic boundary ───────────────────────────────────────────────────────


DocType = Literal[
    "10-K",
    "10-Q",
    "audited_financials",
    "AR_aging",
    "board_minutes",
    "appraisal",
    "business_plan",
]

ExtractionStatus = Literal["pending", "extracting", "extracted", "failed", "returned_for_revision"]

ValidationDecision = Literal["PROCEED", "RETURN_FOR_REVISION"]


class DocumentInput(BaseModel):
    """One row of application_documents joined with its extraction event."""

    model_config = ConfigDict(extra="forbid")

    doc_id: str = Field(..., min_length=36, max_length=36)
    doc_type: DocType
    extraction_status: ExtractionStatus
    missing_required_fields: list[str] = Field(default_factory=list)
    error_code: str | None = None


class ValidationInput(BaseModel):
    """Everything the gate needs to evaluate one application."""

    model_config = ConfigDict(extra="forbid")

    application_id: str = Field(..., min_length=36, max_length=36)
    loan_amount_usd: float = Field(..., gt=0)
    has_real_estate_collateral: bool = False
    documents: list[DocumentInput]


class MissingItem(BaseModel):
    """One actionable item the applicant needs to fix or supply."""

    model_config = ConfigDict(extra="forbid")

    code: Literal[
        "missing_doc_type",
        "extraction_failed",
        "critical_field_missing",
        "incomplete_application",
    ]
    doc_type: DocType | None = None
    doc_id: str | None = None
    field_path: str | None = None
    applicant_message: str = Field(..., max_length=500)
    severity: Literal["critical", "warning"] = "critical"
    regulation: str | None = None


class ValidationResult(BaseModel):
    """The gate's structured output. Drops directly into
    application_artifacts (artifact_type='return_notice') when
    decision == RETURN_FOR_REVISION."""

    model_config = ConfigDict(extra="forbid")

    application_id: str
    decision: ValidationDecision
    missing_items: list[MissingItem] = Field(default_factory=list)
    submitted_doc_types: list[DocType] = Field(default_factory=list)
    tier_reason: str | None = Field(
        default=None,
        description="Which tier rule was applied (echoes document_requirements.json)",
    )
    next_steps: str = Field(
        ...,
        description="Banker-prose summary the UI renders verbatim above the missing-items checklist",
    )


# ── Tier-rule selection ─────────────────────────────────────────────────────


def _select_tier(
    requirements: dict[str, Any],
    loan_amount_usd: float,
) -> dict[str, Any]:
    """Return the application_completeness.tiers_by_loan_amount entry
    that applies for this loan amount. Tiers are sorted ascending by
    `loan_amount_lt`; first matching tier wins."""
    tiers = requirements["application_completeness"]["tiers_by_loan_amount"]
    sorted_tiers = sorted(tiers, key=lambda t: t["loan_amount_lt"])
    for tier in sorted_tiers:
        if loan_amount_usd < tier["loan_amount_lt"]:
            return tier
    # Fall through to the largest tier
    return sorted_tiers[-1]


def _doc_satisfies(any_of: list[str], submitted: set[str]) -> bool:
    """`any_of` here is just a list of doc-type strings; satisfied iff
    submitted contains at least one."""
    return any(d in submitted for d in any_of)


# ── The gate ────────────────────────────────────────────────────────────────


def evaluate_application_completeness(
    inp: ValidationInput,
    *,
    requirements: dict[str, Any] | None = None,
) -> ValidationResult:
    """Apply all validation rules. Returns a ValidationResult.

    Order of checks:
      1. EXTRACTION_FAILED on any required doc-type → fail loudly.
      2. CRITICAL_FIELDS_MISSING on any extracted doc → fail per field.
      3. APPLICATION_INCOMPLETE: tier rules (must_have + minimum_satisfied_by).
      4. Real-estate collateral: appraisal required (12 CFR 34).

    A document with extraction_status='pending' or 'extracting' is a
    programming error (gate ran too early); we treat those as failed
    rather than passing them through silently.
    """
    requirements = requirements or _load_requirements()
    items: list[MissingItem] = []

    submitted_doc_types: list[str] = sorted({d.doc_type for d in inp.documents})
    submitted_set: set[str] = set(submitted_doc_types)

    # ── 1. Extraction-failed checks ─────────────────────────────────────────
    for d in inp.documents:
        if d.extraction_status == "failed":
            items.append(
                MissingItem(
                    code="extraction_failed",
                    doc_type=d.doc_type,
                    doc_id=d.doc_id,
                    field_path=None,
                    applicant_message=(
                        f"Your {d.doc_type} document could not be processed "
                        f"(error: {d.error_code or 'unknown'}). "
                        "Please re-upload a clean PDF — most often this means "
                        "the file was corrupted, password-protected, or scanned at "
                        "too low a resolution."
                    ),
                    severity="critical",
                )
            )
        elif d.extraction_status in ("pending", "extracting"):
            # Programming error — gate ran too early. Surface loudly.
            items.append(
                MissingItem(
                    code="extraction_failed",
                    doc_type=d.doc_type,
                    doc_id=d.doc_id,
                    field_path=None,
                    applicant_message=(
                        f"Your {d.doc_type} document is still being processed. "
                        "This typically resolves within 60 seconds. If you continue "
                        "to see this notice, please contact your relationship manager."
                    ),
                    severity="critical",
                )
            )

    # ── 2. Critical-field checks for each successfully extracted doc ────────
    for d in inp.documents:
        if d.extraction_status != "extracted":
            continue
        for field in d.missing_required_fields:
            if _is_critical_field(field):
                items.append(
                    MissingItem(
                        code="critical_field_missing",
                        doc_type=d.doc_type,
                        doc_id=d.doc_id,
                        field_path=field,
                        applicant_message=(
                            f"Your {d.doc_type} is missing the required field "
                            f"'{field}'. We extracted the document but couldn't "
                            "find this value. Please supply a version that includes "
                            "it (typically the audited income statement or balance "
                            "sheet table)."
                        ),
                        severity="critical",
                    )
                )

    # ── 3. Application completeness tier ───────────────────────────────────
    tier = _select_tier(requirements, inp.loan_amount_usd)
    must_have: list[str] = tier.get("must_have", [])
    minimum_satisfied_by = tier.get("minimum_satisfied_by", [])

    # `minimum_always`: cross-tier baseline — at least one of {10-K, audited_financials}
    min_always = requirements["application_completeness"].get("minimum_always", {})
    baseline_any = min_always.get("any_of", [])
    if baseline_any and not _doc_satisfies(baseline_any, submitted_set):
        items.append(
            MissingItem(
                code="incomplete_application",
                doc_type=None,
                doc_id=None,
                field_path=None,
                applicant_message=(
                    "Every commercial credit application requires at least one "
                    f"audited annual financial statement set. Submit one of: "
                    f"{', '.join(baseline_any)}."
                ),
                severity="critical",
                regulation="bank_credit_policy_v3",
            )
        )

    for required_doc in must_have:
        if required_doc not in submitted_set:
            items.append(
                MissingItem(
                    code="missing_doc_type",
                    doc_type=required_doc,  # type: ignore[arg-type]
                    doc_id=None,
                    field_path=None,
                    applicant_message=(
                        f"For loan amounts in this tier, the bank requires a "
                        f"{required_doc} document. {tier.get('reason', '')}"
                    ),
                    severity="critical",
                    regulation=tier.get("reason"),
                )
            )

    # `minimum_satisfied_by` blocks (compound any_of/all_of). We only
    # enforce when none of them is satisfied — must_have already covered
    # the simple cases above.
    if minimum_satisfied_by and not any(
        _block_satisfied(block, submitted_set) for block in minimum_satisfied_by
    ):
        items.append(
            MissingItem(
                code="incomplete_application",
                doc_type=None,
                doc_id=None,
                field_path=None,
                applicant_message=(
                    "The submitted document set doesn't satisfy the bank's "
                    "minimum-completeness rule for this loan amount. "
                    f"Tier rule: {tier.get('reason', '')}"
                ),
                severity="critical",
                regulation=tier.get("reason"),
            )
        )

    # ── 4. Real-estate collateral conditional ──────────────────────────────
    if inp.has_real_estate_collateral:
        cc = requirements["application_completeness"].get("collateral_conditional", {})
        rest = cc.get("if_collateral_includes_real_estate", [])
        for required_doc in rest:
            if required_doc not in submitted_set:
                items.append(
                    MissingItem(
                        code="missing_doc_type",
                        doc_type=required_doc,  # type: ignore[arg-type]
                        doc_id=None,
                        field_path=None,
                        applicant_message=(
                            f"Real-estate-secured loans require a current {required_doc}. "
                            "12 CFR 34 requires the appraisal to be no more than 12 months "
                            "old at the time of underwriting."
                        ),
                        severity="critical",
                        regulation="12_CFR_34",
                    )
                )

    # ── 5. Verdict ─────────────────────────────────────────────────────────
    if items:
        decision: ValidationDecision = "RETURN_FOR_REVISION"
        next_steps = (
            f"This application cannot be underwritten as submitted. "
            f"Please address {len(items)} item{'s' if len(items) != 1 else ''} "
            f"below and re-submit through the application portal. "
            "Your relationship manager has been notified."
        )
    else:
        decision = "PROCEED"
        next_steps = (
            "All required documents have been submitted and successfully extracted. "
            "Your application has been routed to underwriting; you will receive a "
            "decision within the regulatory deadline."
        )

    # Deduplicate items (same field_path can land twice if 2 critical-field
    # rules fire — keep the first, drop dupes)
    seen: set[tuple[str | None, str | None, str | None]] = set()
    deduped: list[MissingItem] = []
    for item in items:
        key = (item.code, item.doc_type, item.field_path)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return ValidationResult(
        application_id=inp.application_id,
        decision=decision,
        missing_items=deduped,
        submitted_doc_types=submitted_doc_types,  # type: ignore[arg-type]
        tier_reason=tier.get("reason"),
        next_steps=next_steps,
    )


def _block_satisfied(block: Any, submitted: set[str]) -> bool:
    """Recursively evaluate a minimum_satisfied_by block, which may be:
      - a string  (a single doc-type)
      - {"any_of": [...]}
      - {"all_of": [...]}
    where elements are themselves blocks."""
    if isinstance(block, str):
        return block in submitted
    if not isinstance(block, dict):
        return False
    if "any_of" in block:
        return any(_block_satisfied(b, submitted) for b in block["any_of"])
    if "all_of" in block:
        return all(_block_satisfied(b, submitted) for b in block["all_of"])
    return False
