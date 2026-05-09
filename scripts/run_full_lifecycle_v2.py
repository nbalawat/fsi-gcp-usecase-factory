"""run_full_lifecycle_v2.py — drive a multi-doc application through the
v2 stack from upload to credit memo.

This is the Python equivalent of what Cloud Workflows v2 will orchestrate
once Eventarc is wired. For now it's the cleanest way to run a clean
lifecycle end-to-end against real Landing AI + real Vertex Gemini +
real Cloud SQL.

Stages (mirror workflow.v2.yaml):

  1. Upload      — POST /api/applications (multipart) → app_id + doc_ids
  2. Extract     — for each doc, POST /extract on the document-extractor
                   Cloud Run; update application_documents row
  3. Validate    — GET /api/applications/<id>/validate
                   if RETURN_FOR_REVISION → write return_notice + stop
  4. Service-results — call the deployed legacy atomic services for
                   spreading + DSCR + peers + collateral + exposure
                   (kept on legacy because Track B was a deploy-count
                   refactor; outputs are byte-equivalent)
  5. Rules       — call rules-service for 16 deterministic rule sets
  6. Agents      — call orchestrator-v2's 4 endpoints in sequence:
                   document_processor → analyst → rater_and_covenant →
                   drafter → reviewer
  7. Persist     — write the memo into application_artifacts and update
                   application_state with final decision

Run:
  source dev.env
  export DB_PASS=$(gcloud secrets versions access latest --secret=fsi-banking-db-pass-dev)
  python3 scripts/run_full_lifecycle_v2.py BRW-MIDCAP-MFG
  python3 scripts/run_full_lifecycle_v2.py --all

Each stage prints timing + cost. Total per case: ~$0.10-$0.15, ~3-5min.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
import uuid
from pathlib import Path
from typing import Any

import requests
import sqlalchemy
from sqlalchemy import text


REPO_ROOT = Path(__file__).resolve().parent.parent
DEMO_DIR = REPO_ROOT / "scripts" / "demo_applications"
STATE_DIR = REPO_ROOT / ".fsi-state"


def _read_url(name: str) -> str:
    p = STATE_DIR / f"{name}.url"
    if not p.exists():
        raise RuntimeError(f"missing URL file {p}; deploy the {name} service first")
    return p.read_text().strip()


def _id_token(audience: str) -> str:
    out = subprocess.check_output(
        ["gcloud", "auth", "print-identity-token", f"--audiences={audience}"],
        text=True,
    )
    return out.strip()


# ── DB engine ───────────────────────────────────────────────────────────────


def _engine() -> sqlalchemy.Engine:
    pw = urllib.parse.quote_plus(os.environ["DB_PASS"])
    user = os.environ.get("DB_USER", "fsi_app")
    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "fsi_banking")
    return sqlalchemy.create_engine(
        f"postgresql+psycopg2://{user}:{pw}@{host}:{port}/{name}",
        future=True, pool_pre_ping=True,
    )


# ── Stage 1: upload ─────────────────────────────────────────────────────────


def stage_upload(borrower_dir: Path, ui_base: str) -> dict[str, Any]:
    metadata = json.loads((borrower_dir / "metadata.json").read_text())
    documents = json.loads((borrower_dir / "documents.json").read_text())
    files_dir = borrower_dir / "files"

    files = [
        ("metadata", (None, json.dumps(metadata), "application/json")),
        ("documents", (None, json.dumps(documents), "application/json")),
    ]
    for d in documents:
        files.append((d["field"], (d["filename"], (files_dir / d["filename"]).read_bytes(), "application/pdf")))

    print(f"[1] Uploading {borrower_dir.name} ({len(documents)} doc{'s' if len(documents)!=1 else ''}) ...")
    t0 = time.monotonic()
    r = requests.post(f"{ui_base}/api/applications", files=files, timeout=60)
    elapsed = time.monotonic() - t0
    if r.status_code != 200:
        raise RuntimeError(f"upload failed {r.status_code}: {r.text[:300]}")
    body = r.json()
    print(f"    application_id={body['application_id']}  ({elapsed:.1f}s)")
    return body


# ── Stage 2: extract per doc ────────────────────────────────────────────────


def stage_extract(app_id: str, documents: list[dict], engine: sqlalchemy.Engine) -> list[dict]:
    extractor_url = _read_url("document-extractor")
    audit_url = _read_url("audit-writer")
    extractor_token = _id_token(extractor_url)
    audit_token = _id_token(audit_url)

    extracted = []
    for i, doc in enumerate(documents, 1):
        print(f"[2.{i}] Extracting {doc['doc_type']} ({doc['original_filename']}) ...")
        t0 = time.monotonic()
        r = requests.post(
            f"{extractor_url}/extract",
            headers={"Authorization": f"Bearer {extractor_token}"},
            json={
                "application_id": app_id,
                "doc_id": doc["doc_id"],
                "doc_type": doc["doc_type"],
                "gcs_uri": doc["gcs_uri"],
            },
            timeout=600,
        )
        elapsed = time.monotonic() - t0
        if r.status_code != 200:
            raise RuntimeError(f"extract failed {r.status_code}: {r.text[:200]}")
        result = r.json()
        extracted.append(result)

        # Update application_documents row with extraction results
        with engine.begin() as c:
            c.execute(
                text(
                    "UPDATE application_documents SET "
                    "  extraction_status = :status, "
                    "  page_count = :pages, "
                    "  confidence = :conf, "
                    "  missing_required_fields = CAST(:miss AS jsonb), "
                    "  error_code = :ecode, "
                    "  error_message = :emsg, "
                    "  extracted_at = NOW() "
                    "WHERE doc_id = :doc"
                ),
                {
                    "status": "failed" if result.get("failed") else "extracted",
                    "pages": result.get("page_count"),
                    "conf": result.get("confidence"),
                    "miss": json.dumps(result.get("missing_required_fields", [])),
                    "ecode": result.get("error_code"),
                    "emsg": result.get("error_message"),
                    "doc": doc["doc_id"],
                },
            )

        # Write an event via audit-writer
        requests.post(
            f"{audit_url}/event",
            headers={"Authorization": f"Bearer {audit_token}"},
            json={
                "application_id": app_id,
                "event_type": "document_extracted",
                "service_name": "document-extractor",
                "payload": result,
                "latency_ms": int(elapsed * 1000),
                "cost_usd": result.get("estimated_cost_usd"),
            },
            timeout=30,
        )

        if result.get("failed"):
            print(f"    ✗ FAILED {result.get('error_code')}  ({elapsed:.1f}s)")
        else:
            print(
                f"    ✓ pages={result.get('page_count')} "
                f"citations={len(result.get('citations',[]))} "
                f"cost=${result.get('estimated_cost_usd'):.4f} "
                f"({elapsed:.1f}s)"
            )

    return extracted


# ── Stage 3: validation gate ────────────────────────────────────────────────


def stage_validate(app_id: str, ui_base: str) -> dict[str, Any]:
    print(f"[3] Validating completeness ...")
    t0 = time.monotonic()
    r = requests.get(f"{ui_base}/api/applications/{app_id}/validate", timeout=30)
    elapsed = time.monotonic() - t0
    if r.status_code != 200:
        raise RuntimeError(f"validate failed {r.status_code}: {r.text[:200]}")
    v = r.json()["validation"]
    print(f"    decision={v['decision']}  missing_items={len(v['missing_items'])}  ({elapsed:.1f}s)")
    return v


# ── Stage 4: legacy atomic services (kept for behavior parity) ─────────────


def stage_atomic_services(app_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Call the legacy atomic services for spread + DSCR + peers etc.
    These are the SAME services the orchestrator already deployed; v2's
    consolidation was a deploy-count refactor (Track B), not a behavior
    change."""
    services = {
        "financial_spreader":   "fsi-atomic-financial-spreader",
        "dscr_calculator":      "fsi-atomic-dscr-calculator",
        "peer_benchmarker":     "fsi-atomic-peer-benchmarker",
        "industry_risk_scorer": "fsi-atomic-industry-risk-scorer",
        "collateral_valuator":  "fsi-atomic-collateral-valuator",
        "exposure_aggregator":  "fsi-atomic-exposure-aggregator",
    }
    results = {}
    print(f"[4] Calling legacy atomic services (parallel) ...")
    t0 = time.monotonic()
    for name, svc_name in services.items():
        url = f"https://{svc_name}-v4uibzu6ga-uc.a.run.app"
        try:
            token = _id_token(url)
            r = requests.post(
                url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload, timeout=60,
            )
            if r.status_code == 200:
                results[name] = r.json()
            else:
                results[name] = {"_error": f"http {r.status_code}", "_body": r.text[:200]}
        except Exception as e:
            results[name] = {"_error": str(e)[:200]}
    elapsed = time.monotonic() - t0
    ok = sum(1 for v in results.values() if "_error" not in v)
    print(f"    {ok}/{len(services)} services returned 200 ({elapsed:.1f}s)")
    return results


# ── Stage 5: rules ──────────────────────────────────────────────────────────


def stage_rules(app_id: str, service_results: dict, payload: dict) -> dict:
    print(f"[5] Calling rules-service ...")
    url = _read_url("rules-service")
    token = _id_token(url)
    t0 = time.monotonic()
    try:
        r = requests.post(
            f"{url}/evaluate_all",
            headers={"Authorization": f"Bearer {token}"},
            json={"application_id": app_id, "service_results": service_results, **payload},
            timeout=60,
        )
        elapsed = time.monotonic() - t0
        if r.status_code == 200:
            results = r.json()
            print(f"    {len(results.get('results', {}))} rule sets evaluated ({elapsed:.1f}s)")
            return results
    except Exception as e:
        print(f"    ✗ rules failed: {e}")
    return {"results": {}}


# ── Stage 6: agents (orchestrator-v2) ───────────────────────────────────────


def stage_agents(app_id: str, payload: dict, extracted_docs: list, service_results: dict, rules_results: dict, engine: sqlalchemy.Engine) -> dict:
    """Call orchestrator-v2's 5 agent endpoints in sequence."""
    orch_url = _read_url("orchestrator-credit-memo-v2")
    audit_url = _read_url("audit-writer")
    orch_token = _id_token(orch_url)
    audit_token = _id_token(audit_url)

    def _call(agent: str, body: dict) -> dict:
        print(f"[6.{agent}] calling ...")
        t0 = time.monotonic()
        r = requests.post(
            f"{orch_url}/{agent}",
            headers={"Authorization": f"Bearer {orch_token}", "Content-Type": "application/json"},
            json=body,
            timeout=300,
        )
        elapsed = time.monotonic() - t0
        if r.status_code != 200:
            print(f"    ✗ {agent} failed {r.status_code}: {r.text[:200]}")
            return {}
        out = r.json()
        meta = out.pop("_meta", {})
        print(f"    ✓ {agent} ({elapsed:.1f}s, model={meta.get('model')})")
        # Audit event
        try:
            requests.post(
                f"{audit_url}/event",
                headers={"Authorization": f"Bearer {audit_token}"},
                json={
                    "application_id": app_id,
                    "event_type": "agent_action",
                    "service_name": agent,
                    "payload": {"agent": agent, "model": meta.get("model"), "output_summary": list(out.keys())},
                    "latency_ms": int(elapsed * 1000),
                    "cost_usd": 0.05,
                },
                timeout=30,
            )
        except Exception as e:
            print(f"    (audit write failed: {e})")
        return out

    base = {
        "borrower_id": payload.get("borrower_id"),
        "application_id": app_id,
        "loan_amount_usd": payload.get("loan_amount_usd"),
        "facility_type": payload.get("facility_type"),
        "term_years": payload.get("term_years"),
    }

    reconciled = _call("document_processor", {**base, "documents": extracted_docs})
    analyst    = _call("analyst",            {**base, "reconciled_documents": reconciled, "service_results": service_results, "documents": extracted_docs})
    rater      = _call("rater_and_covenant_designer", {**base, "analyst_output": analyst, "rules_results": rules_results})
    memo       = _call("drafter",            {**base, "analyst_output": analyst, "rating_and_covenants": rater, "service_results": service_results, "documents": extracted_docs})
    review     = _call("reviewer",           {**base, "memo_body": memo, "analyst_output": analyst, "rating_and_covenants": rater, "documents": extracted_docs})

    return {"reconciled": reconciled, "analyst": analyst, "rater": rater, "memo": memo, "review": review}


# ── Stage 7: persist memo + final state ─────────────────────────────────────


def stage_persist(app_id: str, agent_outputs: dict, validation: dict, engine: sqlalchemy.Engine) -> str:
    audit_url = _read_url("audit-writer")
    audit_token = _id_token(audit_url)

    print(f"[7] Persisting outputs ...")

    # Decision: if validation said RETURN, that wins; otherwise use rater's risk_band
    if validation["decision"] == "RETURN_FOR_REVISION":
        decision = "RETURN_FOR_REVISION"
        risk_band = None
    else:
        risk_band = (agent_outputs.get("rater") or {}).get("risk_band")
        review_outcome = (agent_outputs.get("review") or {}).get("review_outcome", "approve")
        if review_outcome == "return_to_drafter":
            decision = "RETURN_FOR_REVISION"
        elif risk_band in ("4-doubtful", "5-loss"):
            decision = "DECLINE"
        else:
            decision = "APPROVE"

    # Write the memo artifact
    memo = agent_outputs.get("memo")
    if memo:
        requests.post(
            f"{audit_url}/artifact",
            headers={"Authorization": f"Bearer {audit_token}"},
            json={
                "application_id": app_id, "artifact_type": "credit_memo",
                "revision_number": 1, "author": "drafter", "body": memo,
            },
            timeout=30,
        )

    # If returned, write the return_notice artifact too
    if validation["decision"] == "RETURN_FOR_REVISION":
        requests.post(
            f"{audit_url}/artifact",
            headers={"Authorization": f"Bearer {audit_token}"},
            json={
                "application_id": app_id, "artifact_type": "return_notice",
                "revision_number": 1, "author": "validation_gate", "body": validation,
            },
            timeout=30,
        )

    # Update application_state
    state_body: dict[str, Any] = {"application_id": app_id, "current_stage": "done", "decision": decision}
    if risk_band:
        state_body["risk_band"] = risk_band
    requests.post(
        f"{audit_url}/state",
        headers={"Authorization": f"Bearer {audit_token}"},
        json=state_body,
        timeout=30,
    )

    print(f"    decision={decision}  risk_band={risk_band}")
    return decision


# ── Driver ──────────────────────────────────────────────────────────────────


def run_one(borrower_dir: Path, ui_base: str, engine: sqlalchemy.Engine) -> dict:
    started = time.monotonic()
    print(f"\n{'='*70}\n RUN  {borrower_dir.name}\n{'='*70}")

    upload_resp = stage_upload(borrower_dir, ui_base)
    app_id = upload_resp["application_id"]

    # Document-extractor: each doc returns its extracted_fields
    extracted = stage_extract(app_id, upload_resp["documents"], engine)

    validation = stage_validate(app_id, ui_base)

    payload = json.loads((borrower_dir / "metadata.json").read_text())
    payload["application_id"] = app_id
    payload["context_id"] = app_id
    payload["loan_amount"] = payload.get("loan_amount_usd")

    # If returned, skip stages 4-6 — go straight to persist with empty agent outputs
    if validation["decision"] == "RETURN_FOR_REVISION":
        decision = stage_persist(app_id, {}, validation, engine)
    else:
        service_results = stage_atomic_services(app_id, payload)
        rules_results = stage_rules(app_id, service_results, payload)
        agent_outputs = stage_agents(app_id, payload, extracted, service_results, rules_results, engine)
        decision = stage_persist(app_id, agent_outputs, validation, engine)

    total = time.monotonic() - started
    print(f"\n{'='*70}\n DONE {borrower_dir.name}: decision={decision}  total={total:.1f}s")
    print(f" View: {ui_base}/cases/{app_id}")
    return {"borrower": borrower_dir.name, "application_id": app_id, "decision": decision, "elapsed_s": round(total, 1)}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("borrower", nargs="?", help="Borrower folder name (e.g. BRW-MIDCAP-MFG)")
    p.add_argument("--all", action="store_true")
    p.add_argument("--ui-base", default=os.environ.get("UI_BASE_URL", "http://localhost:3000"))
    args = p.parse_args()

    if not (args.borrower or args.all):
        p.error("provide a borrower name or --all")

    if not os.environ.get("DB_PASS"):
        print("ERROR: DB_PASS not set. Run:", file=sys.stderr)
        print("  export DB_PASS=$(gcloud secrets versions access latest --secret=fsi-banking-db-pass-dev)", file=sys.stderr)
        return 1

    engine = _engine()

    if args.all:
        targets = sorted(d for d in DEMO_DIR.iterdir() if d.is_dir() and d.name.startswith("BRW-"))
    else:
        targets = [DEMO_DIR / args.borrower]
        if not targets[0].exists():
            print(f"ERROR: {targets[0]} not found", file=sys.stderr)
            return 1

    summary = []
    for d in targets:
        try:
            summary.append(run_one(d, args.ui_base, engine))
        except Exception as e:
            print(f"\n[{d.name}] FAILED: {e}", file=sys.stderr)
            summary.append({"borrower": d.name, "error": str(e)[:200]})

    print(f"\n{'='*70}\n SUMMARY\n{'='*70}")
    for s in summary:
        print(f"  {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
