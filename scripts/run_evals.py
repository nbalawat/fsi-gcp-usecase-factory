"""Run memo evals against one or more application_ids.

Usage:

    # Score a single case
    source dev.env
    export DB_PASS=$(gcloud secrets versions access latest --secret=fsi-banking-db-pass-dev)
    python3 scripts/run_evals.py --app-id 7c56ae2e-1d8f-4e51-b47a-09d9383eef64

    # Score every closed case in the last 24 hours
    python3 scripts/run_evals.py --since 24h

    # Skip the LLM judge (cheap mode)
    python3 scripts/run_evals.py --app-id <id> --no-llm

    # Tag the run with a label so eval_diff can compare runs
    python3 scripts/run_evals.py --app-id <id> --label before-track-2

Each run writes evals/results/<run-id>.json. Run IDs sort by start time
so eval_diff.py can reliably pick "previous" vs "current".
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import sqlalchemy
from sqlalchemy import text

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = REPO_ROOT / "evals" / "results"

sys.path.insert(0, str(REPO_ROOT))

from evals.scorers import (  # noqa: E402  (needs sys.path set above)
    EvalResult,
    Score,
    run_structural_scorers,
    score_depth,
)


def _git_sha() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=False,
            cwd=REPO_ROOT,
        )
        if out.returncode == 0:
            return out.stdout.strip()
    except Exception:
        pass
    return None


def _engine() -> sqlalchemy.Engine:
    """Connect to dev Cloud SQL via the cloud_sql_proxy on 127.0.0.1:5432.

    Set DB_PASS env var to the password from Secret Manager."""
    user = os.environ.get("DB_USER", "fsi_app")
    password = os.environ.get("DB_PASS")
    name = os.environ.get("DB_NAME", "fsi_banking")
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = os.environ.get("DB_PORT", "5432")
    if not password:
        raise SystemExit(
            "DB_PASS env var not set. Run:\n"
            "  export DB_PASS=$(gcloud secrets versions access latest --secret=fsi-banking-db-pass-dev)",
        )
    from urllib.parse import quote_plus

    url = f"postgresql+psycopg2://{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{name}"
    return sqlalchemy.create_engine(url, pool_pre_ping=True, future=True)


def _fetch_case(engine: sqlalchemy.Engine, app_id: str) -> dict[str, Any] | None:
    """Pull memo + documents + state for a single application_id."""
    with engine.begin() as conn:
        state_row = conn.execute(
            text(
                "SELECT borrower_id, current_stage, decision, risk_band "
                "FROM application_state WHERE application_id = :id",
            ),
            {"id": app_id},
        ).first()
        if not state_row:
            return None
        memo_row = conn.execute(
            text(
                "SELECT body FROM application_artifacts "
                "WHERE application_id = :id AND artifact_type = 'credit_memo' "
                "ORDER BY revision_number DESC LIMIT 1",
            ),
            {"id": app_id},
        ).first()
        if not memo_row:
            return None
        body = memo_row[0]
        # The drafter sometimes wraps as {memo: {...}}; unwrap.
        memo = body.get("memo") if isinstance(body, dict) and "memo" in body else body

        docs_rows = conn.execute(
            text(
                "SELECT d.doc_id, d.doc_type, d.original_filename, d.page_count, "
                "       e.payload AS extraction_payload "
                "FROM application_documents d "
                "LEFT JOIN application_events e ON e.id = d.extraction_event_id "
                "WHERE d.application_id = :id "
                "ORDER BY d.uploaded_at",
            ),
            {"id": app_id},
        ).all()

    documents: list[dict[str, Any]] = []
    for r in docs_rows:
        ep = (r.extraction_payload or {}) if isinstance(r.extraction_payload, dict) else {}
        documents.append(
            {
                "doc_id": str(r.doc_id),
                "doc_type": r.doc_type,
                "original_filename": r.original_filename,
                "page_count": r.page_count,
                "extracted_fields": ep.get("extracted_fields") or {},
                "citations": ep.get("citations") or [],
                # raw_markdown: present for newly-extracted docs only
                # (older audit events from before the schema change won't
                # have it; the depth judge handles missing markdown).
                "raw_markdown": ep.get("raw_markdown"),
            },
        )

    return {
        "borrower_id": state_row.borrower_id,
        "current_stage": state_row.current_stage,
        "decision": state_row.decision,
        "risk_band": state_row.risk_band,
        "memo": memo or {},
        "documents": documents,
    }


def _list_recent_done_cases(engine: sqlalchemy.Engine, hours: int) -> list[str]:
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                "SELECT application_id FROM application_state "
                "WHERE current_stage = 'done' "
                "  AND updated_at > NOW() - (:hours || ' hours')::interval "
                "ORDER BY updated_at DESC",
            ),
            {"hours": hours},
        ).all()
    return [str(r[0]) for r in rows]


def run_one(
    engine: sqlalchemy.Engine,
    app_id: str,
    run_id: str,
    git_sha: str | None,
    *,
    use_llm: bool,
) -> EvalResult | None:
    case = _fetch_case(engine, app_id)
    if case is None:
        print(f"[skip] {app_id}: no case or no memo found", file=sys.stderr)
        return None

    print(f"[score] {app_id} ({case['borrower_id']}) — {len(case['documents'])} docs")

    scores: list[Score] = run_structural_scorers(case["memo"], case["documents"])
    if use_llm:
        try:
            scores.append(score_depth(case["memo"], case["documents"]))
        except Exception as exc:
            print(f"  [llm-judge] failed: {exc}", file=sys.stderr)
            scores.append(
                Score(name="depth_llm", value=0.0, evidence=[f"failed: {exc}"]),
            )

    return EvalResult(
        application_id=app_id,
        borrower_id=str(case["borrower_id"]),
        run_id=run_id,
        git_sha=git_sha,
        scores=scores,
    )


def parse_since(arg: str) -> int:
    """`24h` / `2d` → hours."""
    if arg.endswith("h"):
        return int(arg[:-1])
    if arg.endswith("d"):
        return int(arg[:-1]) * 24
    return int(arg)  # raw hours


def main() -> int:
    p = argparse.ArgumentParser(description="Score memos against the eval rubrics.")
    p.add_argument("--app-id", help="Single application_id to score.")
    p.add_argument("--since", help="Score every done case from the last N hours (e.g. 24h, 2d).")
    p.add_argument(
        "--no-llm",
        action="store_true",
        help="Skip the LLM judge — only run deterministic scorers (free, fast).",
    )
    p.add_argument(
        "--label",
        default=None,
        help="Tag the run-id with a human-readable label (e.g. 'before-track-2').",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Override output path (default: evals/results/<run-id>.json).",
    )
    args = p.parse_args()

    if not args.app_id and not args.since:
        p.error("provide --app-id or --since")

    engine = _engine()
    if args.app_id:
        ids = [args.app_id]
    else:
        ids = _list_recent_done_cases(engine, parse_since(args.since))
        print(f"[scope] {len(ids)} done cases in the last {args.since}")

    git_sha = _git_sha()
    ts = dt.datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    label = args.label or git_sha or "run"
    run_id = f"{ts}__{label}"

    results: list[EvalResult] = []
    for app_id in ids:
        r = run_one(engine, app_id, run_id, git_sha, use_llm=not args.no_llm)
        if r is not None:
            results.append(r)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = args.out or (RESULTS_DIR / f"{run_id}.json")
    payload = {
        "run_id": run_id,
        "git_sha": git_sha,
        "label": args.label,
        "case_count": len(results),
        "average_across_cases": (
            round(sum(r.average for r in results) / len(results), 2) if results else 0.0
        ),
        "total_cost_usd": round(sum(r.total_cost_usd for r in results), 4),
        "results": [r.as_dict() for r in results],
    }
    out.write_text(json.dumps(payload, indent=2, default=str))
    print(f"\nwrote {out}")
    print(
        f"avg score across {len(results)} case(s): {payload['average_across_cases']:.2f}/5"
        f"   cost: ${payload['total_cost_usd']:.4f}",
    )

    # Print per-case headline so the operator gets immediate signal
    for r in results:
        line = f"  {r.borrower_id:24s} avg={r.average:.2f}/5"
        for s in r.scores:
            line += f"   {s.name}={s.value:.2f}"
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
