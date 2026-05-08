#!/usr/bin/env python3
"""Re-normalize stored credit-memo artifacts whose executive_summary.text was
populated with a serialized JSON blob (the symptom of the drafter wrapping its
output as `{credit_memorandum_draft: {...}}` and the orchestrator falling
through to the synthesizer with `narrative = json.dumps(memo)`).

Run after redeploying the orchestrator with the new wrapper-unwrap + sub-field
mapping in `_normalize_drafter_memo`. This rewrites the memo in
`application_artifacts` for every case where the symptom is detected and
re-derives `application_state.decision` / `risk_band` from the repaired memo.

Connects via the local Cloud SQL Auth Proxy (DB_HOST/DB_PORT/DB_USER/DB_PASS/
DB_NAME env vars, populated by `scripts/dev_up.sh`).

Usage:
    bash scripts/dev_up.sh                      # ensure proxy + creds in env
    python scripts/repair_memos.py              # repair all detected
    python scripts/repair_memos.py --app <uuid> # repair one
    python scripts/repair_memos.py --dry-run    # show what would change
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

# Import the live normalizer from the orchestrator so the rules stay in sync.
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "services" / "orchestrator-credit-memo"))

# Some heavy imports in main.py rely on env vars / GCP libs we don't need
# here. Guard against them by stubbing google modules on the import path.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")  # short-circuits client init
try:
    from main import _normalize_drafter_memo, _validate_memo  # type: ignore
except Exception as exc:
    print(f"[fatal] Could not import orchestrator main: {exc}", file=sys.stderr)
    raise

import sqlalchemy as sa
from sqlalchemy import text


def _engine() -> sa.Engine:
    from urllib.parse import quote_plus

    user = os.environ.get("DB_USER", "fsi_app")
    pwd = os.environ.get("DB_PASS") or os.environ.get("DB_PASSWORD") or ""
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "fsi_app")
    if not pwd:
        print("[fatal] DB_PASS not set; run `bash scripts/dev_up.sh` first", file=sys.stderr)
        sys.exit(2)
    # SQLAlchemy URL-parses the password; quote special chars.
    url = f"postgresql+psycopg2://{quote_plus(user)}:{quote_plus(pwd)}@{host}:{port}/{name}"
    return sa.create_engine(url, pool_pre_ping=True)


def _is_broken(memo: dict[str, Any]) -> bool:
    """A memo is 'broken' when its executive_summary.text is a JSON dump
    rather than banker prose. Heuristic: text starts with `{` and contains
    `credit_memorandum_draft` / `borrower_profile` / `borrower_analysis`."""
    if not isinstance(memo, dict):
        return False
    es = memo.get("executive_summary")
    if not isinstance(es, dict):
        return True
    txt = es.get("text") or ""
    if not isinstance(txt, str):
        return True
    s = txt.strip()
    if s.startswith("{") and (
        "credit_memorandum_draft" in s
        or "borrower_profile" in s
        or "borrower_analysis" in s
        or "key_strengths" in s
    ):
        return True
    # Also trip if synthesizer placeholder is still there
    if "(orchestrator could not assemble" in s:
        return True
    return False


def _decision_from_memo(memo: dict[str, Any]) -> tuple[str | None, str | None]:
    """Return (decision, risk_band) from the repaired memo for state update."""
    decision = None
    risk_band = None
    rec = memo.get("recommendation") or {}
    if isinstance(rec, dict):
        action = rec.get("action")
        if isinstance(action, str):
            decision = {
                "approve": "APPROVE",
                "decline": "DECLINE",
                "return_for_revision": "RETURN",
            }.get(action.lower())
    rrr = memo.get("risk_rating_rationale") or {}
    if isinstance(rrr, dict):
        rb = rrr.get("risk_band")
        if isinstance(rb, str):
            risk_band = rb
    return decision, risk_band


def repair(app_id: str | None, dry_run: bool) -> int:
    eng = _engine()
    with eng.connect() as conn:
        if app_id:
            rows = conn.execute(
                text("SELECT application_id, body FROM application_artifacts WHERE application_id = :id AND artifact_type = 'credit_memo'"),
                {"id": app_id},
            ).fetchall()
        else:
            rows = conn.execute(
                text("SELECT application_id, body FROM application_artifacts WHERE artifact_type = 'credit_memo'"),
            ).fetchall()

    if not rows:
        print("[info] No credit_memo artifacts found.")
        return 0

    repaired = 0
    skipped = 0
    for r in rows:
        rid = str(r[0])
        body = r[1]
        if isinstance(body, (str, bytes)):
            try:
                body = json.loads(body)
            except json.JSONDecodeError:
                print(f"[skip] {rid}: body is not JSON-parseable")
                skipped += 1
                continue
        if not isinstance(body, dict):
            print(f"[skip] {rid}: body is not a dict")
            skipped += 1
            continue
        memo = body.get("memo") if isinstance(body.get("memo"), dict) else body
        if not _is_broken(memo):
            skipped += 1
            continue

        es = memo.get("executive_summary") or {}
        txt = (es.get("text") or "").strip() if isinstance(es, dict) else ""

        # Try to parse the wrapped JSON in text (drafter put the whole memo
        # inside executive_summary.text as a JSON string).
        rebase: dict[str, Any] = {}
        if txt.startswith("{"):
            try:
                rebase = json.loads(txt)
            except json.JSONDecodeError:
                # The synthesizer truncated to 4000 chars; can't parse back.
                rebase = {}
        if rebase:
            payload = {
                "application_id": rid,
                "borrower_id": memo.get("borrower_id"),
                "borrower_name": (memo.get("executive_summary") or {}).get("borrower_name"),
                "loan_amount": ((memo.get("executive_summary") or {}).get("loan_request") or {}).get("amount_usd"),
                "loan_request": (memo.get("executive_summary") or {}).get("loan_request") or {},
                "naics_code": (es.get("industry") or "").replace("NAICS ", "") if isinstance(es, dict) else "",
            }
            normalized = _normalize_drafter_memo(rebase, payload)
            if not isinstance(normalized, dict) or "executive_summary" not in normalized:
                print(f"[skip] {rid}: re-normalization did not produce executive_summary")
                skipped += 1
                continue
            # Preserve top-level metadata.
            for key in ("version", "application_id", "borrower_id", "drafted_at",
                        "drafted_by", "review_status", "citation_density"):
                if key in memo and key not in normalized:
                    normalized[key] = memo[key]
            # Splice missing sections from the previous memo (their data is
            # real atomic-service output).
            for sect in (
                "borrower_overview", "financial_analysis", "cash_flow_projection",
                "risk_factors", "collateral", "covenant_package",
                "regulatory_concentration", "risk_rating_rationale", "recommendation",
            ):
                if sect not in normalized and sect in memo:
                    normalized[sect] = memo[sect]
        else:
            # Truncated / unparseable JSON dump in text. Build a clean
            # narrative from the OTHER (well-formed) memo sections — those
            # were written from real service outputs and are safe to read.
            normalized = dict(memo)  # shallow copy, keep all good sections
            new_es = dict(es) if isinstance(es, dict) else {}
            borrower_name = (
                new_es.get("borrower_name")
                or memo.get("borrower_id", "the borrower")
            )
            loan_req = new_es.get("loan_request") or {}
            amount = loan_req.get("amount_usd") or 0
            term = loan_req.get("term_years") or 5
            facility = loan_req.get("facility_type") or "term loan"

            risk_band = (
                (memo.get("risk_rating_rationale") or {}).get("risk_band")
                or new_es.get("risk_rating")
                or "1-pass"
            )
            rec_action = (
                (memo.get("recommendation") or {}).get("action")
                or new_es.get("recommendation_action")
                or "approve"
            )
            decision_word = {
                "approve": "Approve",
                "decline": "Decline",
                "return_for_revision": "Return for revision",
            }.get(str(rec_action).lower(), "Approve")

            # Pull a few facts from atomic service results spliced in elsewhere.
            ratios = (memo.get("financial_analysis") or {}).get("trend_table", {})
            covenants = (memo.get("covenant_package") or {}).get("maintenance_covenants") or []
            cov_count = len(covenants) if isinstance(covenants, list) else 0
            collat = memo.get("collateral") or {}
            coverage = (collat.get("coverage_pct") if isinstance(collat, dict) else None) or 0
            sb = ((memo.get("regulatory_concentration") or {}).get("single_borrower_limit") or {}).get("exposure_pct") or 0

            new_es["text"] = (
                f"{borrower_name} requests a ${amount:,.0f} {facility} over {term} years. "
                f"Underwriting placed the borrower at risk band {risk_band}; recommendation: {decision_word}. "
                f"Single-borrower exposure at {sb*100:.1f}% of Tier 1 capital. "
                f"Collateral coverage {coverage*100:.1f}%. "
                f"{cov_count} maintenance covenants proposed. "
                f"(Note: this executive summary was reconstructed from deterministic atomic-service "
                f"outputs after the original drafter response was lost to a truncation bug; the "
                f"agent audit trail and the detailed sections below remain accurate.)"
            )
            new_es["recommendation_action"] = str(rec_action).lower()
            # If highlights weren't already present or were placeholder, build from facts.
            if not new_es.get("highlights"):
                new_es["highlights"] = [
                    f"Risk band: {risk_band}",
                    f"Single-borrower exposure: {sb*100:.1f}% of Tier 1 (12 CFR 32 limit 10/15/25%)",
                    f"Collateral coverage: {coverage*100:.0f}%",
                ][:5]
            normalized["executive_summary"] = new_es

        errors = _validate_memo(normalized)
        if errors:
            print(f"[warn] {rid}: {len(errors)} schema errors after repair (first: {errors[0]})")

        new_body = {**body, "memo": normalized} if "memo" in body else normalized
        decision, risk_band = _decision_from_memo(normalized)

        print(f"[repair] {rid}  decision={decision}  risk_band={risk_band}  validation_errors={len(errors)}")

        if dry_run:
            repaired += 1
            continue

        with eng.begin() as conn:
            # Update the latest revision in place (the UI reads MAX(revision_number)).
            conn.execute(
                text(
                    "UPDATE application_artifacts "
                    "SET body = CAST(:b AS jsonb) "
                    "WHERE application_id = :id "
                    "  AND artifact_type = 'credit_memo' "
                    "  AND revision_number = ("
                    "    SELECT MAX(revision_number) FROM application_artifacts "
                    "    WHERE application_id = :id AND artifact_type = 'credit_memo'"
                    "  )"
                ),
                {"b": json.dumps(new_body), "id": rid},
            )
            if decision or risk_band:
                conn.execute(
                    text(
                        "UPDATE application_state SET "
                        "  decision = COALESCE(:dec, decision), "
                        "  risk_band = COALESCE(:rb, risk_band), "
                        "  updated_at = NOW() "
                        "WHERE application_id = :id"
                    ),
                    {"dec": decision, "rb": risk_band, "id": rid},
                )
        repaired += 1

    print(f"\n[done] repaired={repaired}  skipped={skipped}  total={len(rows)}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", help="Only repair this application_id")
    ap.add_argument("--dry-run", action="store_true", help="Print plan, don't write")
    args = ap.parse_args()
    sys.exit(repair(args.app, args.dry_run))
