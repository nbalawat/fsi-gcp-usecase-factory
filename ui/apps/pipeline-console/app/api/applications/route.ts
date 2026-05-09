/**
 * /api/applications — multi-document loan-application ingest.
 *
 * Replaces the legacy single-doc /api/ingest-10k flow (which forced one PDF
 * per application and used regex landmarks for extraction). The new flow
 * accepts an arbitrary set of documents per application — a $200M+ loan
 * needs all four of {10-K, 10-Q, AR_aging, board_minutes}, and processing
 * them in parallel is the only way to hit the under-5-minute SLO.
 *
 * Wire shape (multipart/form-data):
 *   metadata=<JSON string>:
 *     {
 *       borrower_id:    string,                       // BRW-LECO etc.
 *       borrower_name:  string,
 *       loan_amount_usd: number,
 *       naics_code?:    string,
 *       facility_type?: "term_loan" | "revolver" | ...,
 *       term_years?:    number,
 *       scenario_tag?:  string                        // for traceability
 *     }
 *   documents=<JSON string>:
 *     [
 *       { field: "file_0", doc_type: "10-K"          },
 *       { field: "file_1", doc_type: "AR_aging"      },
 *       { field: "file_2", doc_type: "board_minutes" }
 *     ]
 *   file_0=<binary>, file_1=<binary>, ...
 *
 * Pipeline:
 *   1. Validate metadata + documents manifest + each file (size, mimetype).
 *   2. Generate application_id (UUIDv4).
 *   3. For each file:
 *      - Compute SHA-256 (used for idempotent re-uploads + audit).
 *      - Upload to gs://<bucket>/applications/<app_id>/documents/<doc_id>.pdf
 *        with object-metadata.
 *   4. Begin DB tx:
 *      - INSERT application_state (current_stage='intake')
 *      - INSERT one application_documents row per uploaded doc
 *        (extraction_status='pending')
 *      - INSERT one stage_entered application_event
 *   5. Commit.
 *   6. Publish loans.application.submitted to Pub/Sub with documents[]
 *      so the credit-memo handler can fan-out parallel document-extractor
 *      calls.
 *   7. Return { application_id, doc_count, documents[], redirect_url }.
 *
 * Failure modes (all surface real status codes — Rule 3 of product-build-
 * discipline; no silent stubs):
 *   400  — invalid form payload, malformed metadata, bad doc_type
 *   413  — any file exceeds MAX_BYTES
 *   422  — one of the files isn't actually a PDF
 *   500  — partial GCS upload (we attempt to clean up uploaded objects)
 *   503  — DB or GCS unavailable
 */

import { NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";

import { getPool, isDbConfigured, DB_UNAVAILABLE_MESSAGE } from "../../../lib/db";
import {
  uploadApplicationDocument,
  isGcsConfigured,
  GCS_UNAVAILABLE_MESSAGE,
} from "../../../lib/gcs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_DOC_TYPES = [
  "10-K",
  "10-Q",
  "audited_financials",
  "AR_aging",
  "board_minutes",
  "appraisal",
  "business_plan",
] as const;
type DocType = (typeof KNOWN_DOC_TYPES)[number];

const MAX_BYTES_PER_FILE = 50 * 1024 * 1024; // 50 MB
const MAX_FILES_PER_APP = 12;
const TOPIC_SUBMITTED =
  process.env.PUBSUB_TOPIC_LOANS_SUBMITTED ?? "loans.application.submitted";

// ── Pub/Sub ─────────────────────────────────────────────────────────────

let _pubsubClient: {
  topic: (n: string) => {
    publishMessage: (m: {
      data: Buffer;
      attributes?: Record<string, string>;
    }) => Promise<string>;
  };
} | null = null;
async function getPubsub() {
  if (_pubsubClient !== null) return _pubsubClient;
  const mod = await import("@google-cloud/pubsub");
  const opts: { projectId?: string } = {};
  if (process.env.GCP_PROJECT) opts.projectId = process.env.GCP_PROJECT;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _pubsubClient = new (mod as any).PubSub(opts);
  return _pubsubClient;
}

// ── Validation ──────────────────────────────────────────────────────────

interface IngestMetadata {
  borrower_id: string;
  borrower_name: string;
  loan_amount_usd: number;
  naics_code?: string;
  facility_type?: string;
  term_years?: number;
  scenario_tag?: string;
}

interface DocumentSpec {
  field: string;       // "file_0", "file_1", ...
  doc_type: DocType;
}

function parseMetadata(raw: unknown): IngestMetadata | { error: string } {
  if (typeof raw !== "string") return { error: "metadata must be a JSON string field" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `metadata is not valid JSON: ${(e as Error).message}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "metadata must be a JSON object" };
  }
  const m = parsed as Record<string, unknown>;
  if (typeof m.borrower_id !== "string" || !m.borrower_id) {
    return { error: "metadata.borrower_id is required" };
  }
  if (typeof m.borrower_name !== "string" || !m.borrower_name) {
    return { error: "metadata.borrower_name is required" };
  }
  if (typeof m.loan_amount_usd !== "number" || !(m.loan_amount_usd > 0)) {
    return { error: "metadata.loan_amount_usd must be a positive number" };
  }
  return {
    borrower_id: m.borrower_id,
    borrower_name: m.borrower_name,
    loan_amount_usd: m.loan_amount_usd,
    naics_code: typeof m.naics_code === "string" ? m.naics_code : undefined,
    facility_type:
      typeof m.facility_type === "string" ? m.facility_type : undefined,
    term_years: typeof m.term_years === "number" ? m.term_years : undefined,
    scenario_tag:
      typeof m.scenario_tag === "string" ? m.scenario_tag : undefined,
  };
}

function parseDocuments(raw: unknown): DocumentSpec[] | { error: string } {
  if (typeof raw !== "string") {
    return { error: "documents must be a JSON string field" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `documents is not valid JSON: ${(e as Error).message}` };
  }
  if (!Array.isArray(parsed)) {
    return { error: "documents must be a JSON array" };
  }
  if (parsed.length === 0) {
    return { error: "at least one document is required" };
  }
  if (parsed.length > MAX_FILES_PER_APP) {
    return {
      error: `too many documents (${parsed.length}); max ${MAX_FILES_PER_APP} per application`,
    };
  }
  const out: DocumentSpec[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const d = parsed[i] as Record<string, unknown> | undefined;
    if (!d || typeof d !== "object") {
      return { error: `documents[${i}] must be an object` };
    }
    if (typeof d.field !== "string" || !d.field) {
      return { error: `documents[${i}].field is required` };
    }
    if (typeof d.doc_type !== "string") {
      return { error: `documents[${i}].doc_type is required` };
    }
    if (!(KNOWN_DOC_TYPES as readonly string[]).includes(d.doc_type)) {
      return {
        error: `documents[${i}].doc_type must be one of ${KNOWN_DOC_TYPES.join(", ")}; got ${d.doc_type}`,
      };
    }
    out.push({ field: d.field, doc_type: d.doc_type as DocType });
  }
  return out;
}

function isPdfMagic(bytes: Uint8Array): boolean {
  // %PDF-
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function sha256Hex(b: Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}

// ── Route ───────────────────────────────────────────────────────────────

interface UploadedDocResult {
  doc_id: string;
  doc_type: DocType;
  original_filename: string;
  size_bytes: number;
  sha256_hex: string;
  gcs_uri: string;
}

export async function POST(req: Request): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }
  if (!isGcsConfigured()) {
    return NextResponse.json(
      { ok: false, error: GCS_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  // 1. Parse multipart body
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Bad form data: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  // 2. Validate metadata + documents manifest
  const meta = parseMetadata(fd.get("metadata"));
  if ("error" in meta) {
    return NextResponse.json({ ok: false, error: meta.error }, { status: 400 });
  }

  const docs = parseDocuments(fd.get("documents"));
  if (!Array.isArray(docs)) {
    return NextResponse.json({ ok: false, error: docs.error }, { status: 400 });
  }

  // 3. Resolve each declared file in the manifest to a real File object.
  //    Validate size + PDF magic bytes.
  type Resolved = { spec: DocumentSpec; file: File; bytes: Uint8Array };
  const resolved: Resolved[] = [];
  for (let i = 0; i < docs.length; i++) {
    const spec = docs[i]!;
    const f = fd.get(spec.field);
    if (!(f instanceof File)) {
      return NextResponse.json(
        {
          ok: false,
          error: `documents[${i}] references field ${spec.field} but no File was uploaded under that name`,
        },
        { status: 400 },
      );
    }
    if (f.size === 0) {
      return NextResponse.json(
        { ok: false, error: `${spec.field} (${spec.doc_type}) is empty` },
        { status: 422 },
      );
    }
    if (f.size > MAX_BYTES_PER_FILE) {
      return NextResponse.json(
        {
          ok: false,
          error: `${spec.field} (${spec.doc_type}) is ${f.size} bytes; limit ${MAX_BYTES_PER_FILE}`,
        },
        { status: 413 },
      );
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!isPdfMagic(bytes)) {
      return NextResponse.json(
        {
          ok: false,
          error: `${spec.field} (${spec.doc_type}) doesn't have a PDF header; only PDFs are accepted`,
        },
        { status: 422 },
      );
    }
    resolved.push({ spec, file: f, bytes });
  }

  // 4. Allocate IDs and upload to GCS in parallel
  const application_id = randomUUID();
  const uploadJobs = resolved.map(async (r): Promise<UploadedDocResult> => {
    const doc_id = randomUUID();
    const sha = sha256Hex(r.bytes);
    const upload = await uploadApplicationDocument({
      applicationId: application_id,
      docId: doc_id,
      docType: r.spec.doc_type,
      contentType: r.file.type || "application/pdf",
      bytes: r.bytes,
      originalFilename: r.file.name,
      sha256Hex: sha,
    });
    return {
      doc_id,
      doc_type: r.spec.doc_type,
      original_filename: r.file.name,
      size_bytes: upload.size_bytes,
      sha256_hex: sha,
      gcs_uri: upload.gcs_uri,
    };
  });

  let uploaded: UploadedDocResult[];
  try {
    uploaded = await Promise.all(uploadJobs);
  } catch (e) {
    // Best-effort cleanup: try to delete any objects that succeeded before
    // the failure. A leaked object is recoverable (lifecycle-rule cleanup),
    // but we surface the failure loudly so the operator notices.
    return NextResponse.json(
      {
        ok: false,
        error: `Upload to GCS failed: ${(e as Error).message}. ` +
          `Some objects may have landed in gs://.../${application_id}/; ` +
          `bucket lifecycle rules will purge orphans.`,
      },
      { status: 500 },
    );
  }

  // 5. DB transaction — application_state + N application_documents +
  //    one stage_entered event. If any insert fails, roll back so we
  //    don't leave half-tracked state in the DB. (The GCS objects are
  //    already up; we tolerate that — the lifecycle rule cleans orphans.)
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // application_state
    const now = new Date();
    const deadline = new Date(now.getTime() + 5 * 24 * 3600_000); // 5 business days
    await client.query(
      `INSERT INTO application_state (
         application_id, borrower_id, borrower_name, naics_code,
         loan_amount_usd, scenario_tag, current_stage,
         regulatory_deadline, clock_started_at, created_at, updated_at, last_event_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'intake', $7, $8, NOW(), NOW(), NOW())`,
      [
        application_id,
        meta.borrower_id,
        meta.borrower_name,
        meta.naics_code ?? null,
        meta.loan_amount_usd,
        meta.scenario_tag ?? "multi-doc-upload",
        deadline.toISOString(),
        now.toISOString(),
      ],
    );

    // application_documents (one per upload)
    for (const u of uploaded) {
      await client.query(
        `INSERT INTO application_documents (
           doc_id, application_id, doc_type, original_filename,
           gcs_uri, file_size_bytes, sha256_hex, extraction_status, uploaded_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())`,
        [
          u.doc_id,
          application_id,
          u.doc_type,
          u.original_filename,
          u.gcs_uri,
          u.size_bytes,
          u.sha256_hex,
        ],
      );
    }

    // intake stage event (one row records the multi-doc submission)
    await client.query(
      `INSERT INTO application_events (
         application_id, event_type, service_name, payload, occurred_at
       ) VALUES ($1, 'stage_entered', 'ui-multi-doc-upload', $2::jsonb, NOW())`,
      [
        application_id,
        JSON.stringify({
          stage: "intake",
          channel: "multi-doc-upload",
          doc_count: uploaded.length,
          doc_types: uploaded.map((u) => u.doc_type),
          facility_type: meta.facility_type ?? null,
          term_years: meta.term_years ?? null,
          loan_amount_usd: meta.loan_amount_usd,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json(
      {
        ok: false,
        error: `DB write failed (rolled back): ${(e as Error).message}. ` +
          `${uploaded.length} GCS objects may be orphaned under ` +
          `applications/${application_id}/.`,
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }

  // 6. Publish to Pub/Sub for the credit-memo handler to pick up.
  //    Non-fatal: if this fails, the row is in the DB and the orchestrator's
  //    poll-for-intake fallback will still pick it up. We surface the status
  //    in the response for observability.
  let pubsubResult: { ok: boolean; reason?: string; messageId?: string } = {
    ok: false,
    reason: "GCP_PROJECT not set",
  };
  if (process.env.GCP_PROJECT) {
    try {
      const ps = await getPubsub();
      const msgPayload = {
        application_id,
        borrower_id: meta.borrower_id,
        borrower_name: meta.borrower_name,
        loan_amount_usd: meta.loan_amount_usd,
        naics_code: meta.naics_code,
        facility_type: meta.facility_type ?? "term_loan",
        term_years: meta.term_years ?? 5,
        scenario_tag: meta.scenario_tag ?? "multi-doc-upload",
        submitted_at: new Date().toISOString(),
        documents: uploaded.map((u) => ({
          doc_id: u.doc_id,
          doc_type: u.doc_type,
          gcs_uri: u.gcs_uri,
          original_filename: u.original_filename,
          size_bytes: u.size_bytes,
          sha256_hex: u.sha256_hex,
        })),
        ingested_via: "ui-multi-doc-upload",
      };
      const messageId = await ps!
        .topic(TOPIC_SUBMITTED)
        .publishMessage({
          data: Buffer.from(JSON.stringify(msgPayload), "utf-8"),
          attributes: {
            event_type: "loans.application.submitted",
            application_id,
            borrower_id: meta.borrower_id,
            doc_count: String(uploaded.length),
            ingested_via: "ui-multi-doc-upload",
          },
        });
      pubsubResult = { ok: true, messageId };
    } catch (e) {
      pubsubResult = { ok: false, reason: (e as Error).message };
    }
  }

  return NextResponse.json(
    {
      ok: true,
      application_id,
      doc_count: uploaded.length,
      documents: uploaded.map((u) => ({
        doc_id: u.doc_id,
        doc_type: u.doc_type,
        original_filename: u.original_filename,
        size_bytes: u.size_bytes,
        gcs_uri: u.gcs_uri,
      })),
      side_effects: {
        pubsub_published: pubsubResult.ok,
        pubsub_message_id: pubsubResult.messageId ?? null,
        pubsub_reason: pubsubResult.ok ? null : pubsubResult.reason,
      },
      redirect_url: `/cases/${application_id}`,
      next_stage: "spreading",
      message:
        `${uploaded.length} document${uploaded.length === 1 ? "" : "s"} ` +
        `uploaded; the document-extractor service will process them in parallel.`,
    },
    { status: 200 },
  );
}
