/**
 * Google Cloud Storage helper for the multi-document ingest path.
 *
 * Single-tenant convention:
 *   Bucket   : ${process.env.GCS_APPLICATION_DOCS_BUCKET ?? `${GCP_PROJECT}-application-documents`}
 *   Object   : applications/<application_id>/documents/<doc_id>.pdf
 *
 * Auth uses Application Default Credentials. The Cloud Run service account
 * needs `roles/storage.objectAdmin` on the bucket; locally, the developer's
 * gcloud ADC token works (run `gcloud auth application-default login`).
 *
 * Per Rule 3 (no silent stubs) of product-build-discipline.md: when the
 * storage client can't be initialized OR the bucket isn't reachable, the
 * caller MUST surface a 503 — never a swallow-and-continue.
 */

import { Storage } from "@google-cloud/storage";

let _storage: Storage | null = null;

function bucketName(): string {
  const explicit = process.env.GCS_APPLICATION_DOCS_BUCKET;
  if (explicit) return explicit;
  const project = process.env.GCP_PROJECT;
  if (!project) {
    throw new Error(
      "Cannot determine bucket — set GCS_APPLICATION_DOCS_BUCKET or GCP_PROJECT",
    );
  }
  return `${project}-application-documents`;
}

function client(): Storage {
  if (_storage === null) {
    const opts: { projectId?: string } = {};
    if (process.env.GCP_PROJECT) opts.projectId = process.env.GCP_PROJECT;
    _storage = new Storage(opts);
  }
  return _storage;
}

export interface UploadResult {
  gcs_uri: string;
  bucket: string;
  object: string;
  size_bytes: number;
}

/**
 * Upload one document under
 *   gs://<bucket>/applications/<app_id>/documents/<doc_id>.pdf
 * with `applicationId` + `docType` recorded as object metadata so audit
 * tooling can re-derive the relationship from the bucket alone.
 *
 * Throws on any failure — the caller decides how to surface (typically
 * 503 with the message) so the demo is never silently degraded.
 */
export async function uploadApplicationDocument(args: {
  applicationId: string;
  docId: string;
  docType: string;
  contentType: string;
  bytes: Uint8Array | Buffer;
  originalFilename: string;
  sha256Hex: string;
}): Promise<UploadResult> {
  const bucket = bucketName();
  const object = `applications/${args.applicationId}/documents/${args.docId}.pdf`;
  const file = client().bucket(bucket).file(object);
  const buf = Buffer.from(args.bytes);

  await file.save(buf, {
    contentType: args.contentType || "application/pdf",
    metadata: {
      contentType: args.contentType || "application/pdf",
      // Object-metadata fields land at the GCS API level
      metadata: {
        application_id: args.applicationId,
        doc_id: args.docId,
        doc_type: args.docType,
        original_filename: args.originalFilename,
        sha256_hex: args.sha256Hex,
        ingested_via: "ui-multi-doc-upload",
      },
    },
    resumable: false,
  });

  return {
    gcs_uri: `gs://${bucket}/${object}`,
    bucket,
    object,
    size_bytes: buf.byteLength,
  };
}

/**
 * True when GCP credentials and a bucket name are both resolvable. The
 * route uses this to return a 503 with a helpful message instead of a
 * raw uncaught exception.
 */
export function isGcsConfigured(): boolean {
  return Boolean(
    (process.env.GCS_APPLICATION_DOCS_BUCKET || process.env.GCP_PROJECT) &&
      (process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCP_PROJECT),
  );
}

export const GCS_UNAVAILABLE_MESSAGE =
  "Cloud Storage is not configured. Set GCP_PROJECT (and optionally " +
  "GCS_APPLICATION_DOCS_BUCKET) and ensure GOOGLE_APPLICATION_CREDENTIALS " +
  "points at a service account key — see ui/apps/pipeline-console/README.md.";
