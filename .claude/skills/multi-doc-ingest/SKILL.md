---
name: multi-doc-ingest
description: Multi-document upload route + application_documents table pattern. Auto-loads when authoring an /api/applications-style endpoint, an upload UI, or a use case that accepts a bundle of documents per case.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*)
---

# Multi-document ingest — the factory pattern

The legacy single-doc `/api/ingest-10k` flow can't process applications
that need a bundle of docs (commercial-credit needs 10-K + 10-Q +
AR_aging + board_minutes for $200M+ loans; mortgage needs 1003 + W-2 +
appraisal + title; commercial-claim needs claim_form + photos + police
report + repair_estimate). This skill captures the pattern from
credit-memo-commercial Track A.3.

## What you build

```
ui/apps/<console>/app/api/applications/route.ts   # multipart POST
ui/apps/<console>/lib/gcs.ts                      # upload helper
infra/shared/schema.sql additions:
  application_documents (1 row per uploaded doc per app)
```

## Wire shape (multipart/form-data)

```
metadata=<JSON>:
  { borrower_id, borrower_name, loan_amount_usd, naics_code?,
    facility_type?, term_years?, scenario_tag? }
documents=<JSON>:
  [{field: "file_0", doc_type: "10-K"}, ...]
file_0=<binary>, file_1=<binary>, ...
```

## The 5 hard gates

| Gate | Why |
|---|---|
| **PDF magic-byte check** | A renamed-to-.pdf .docx must produce 422, not silently land in GCS to fail at extraction |
| **SHA-256 dedup per (application_id, sha256_hex)** | The DB unique constraint catches double-clicks of the upload button (Rule 7 idempotency); the route must surface the FK violation as a loud 500 with rollback message |
| **All-or-nothing DB transaction** | If the second of three application_documents inserts fails, roll back the application_state row too — no half-tracked apps |
| **GCS-orphan tolerance** | Cloud Storage isn't transactional; if the DB tx rolls back after GCS uploads succeeded, the orphans are cleaned by a 1-year bucket lifecycle rule. The route MUST surface this in the error message so the operator knows |
| **Pub/Sub publish is best-effort** | After commit, publish to `loans.application.submitted`; failure is non-fatal but reported in the response's `side_effects` block |

## Real test pattern

```python
@pytest.mark.live
@pytest.mark.skipif(not LIVE_UI_TESTS, reason=...)
def test_three_real_pdfs_land_state_and_documents(db_engine):
    files = [
        ("file_0", "10-K", PDF_FIXTURES / "small_valid_financial.pdf"),
        ("file_1", "AR_aging", PDF_FIXTURES / "smoke_10pages.pdf"),
        ("file_2", "board_minutes", PDF_FIXTURES / "deficient_chairman.pdf"),
    ]
    r = _post_multi_doc(metadata=metadata, files=files)
    assert r.status_code == 200
    # ... verify application_state + 3 application_documents rows landed,
    # then DELETE them on tearDown
```

The 7-test suite in `usecases/credit-memo-commercial/tests/test_multi_doc_ingest.py`
runs against the live dev stack:
- happy path with 3 distinct PDFs
- 5 validation-failure paths (each surfaces a specific status code)
- duplicate-content rollback verification

## What's reusable

**Reusable (use as-is — don't fork)**:
- The `application_documents` schema in `infra/shared/schema.sql` —
  every UC adds rows to the SAME table (one bank, one DB)
- `ui/apps/pipeline-console/lib/gcs.ts` — upload helper
- The 5-gate validation pattern in the route

**Per use case (you author)**:
- The doc_type enum (specific to your domain)
- The metadata Pydantic shape (RM-style vs claim-style vs trust-style)
- The GCS bucket name (use `${GCP_PROJECT}-<uc>-documents` convention)
- The Pub/Sub topic name (your handler's input)

## Reference

- `ui/apps/pipeline-console/app/api/applications/route.ts` (374 lines)
- `usecases/credit-memo-commercial/tests/test_multi_doc_ingest.py`
  (7 tests passing live)
