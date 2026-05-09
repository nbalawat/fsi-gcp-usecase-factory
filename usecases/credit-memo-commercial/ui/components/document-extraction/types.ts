/**
 * Per-document extraction types — shared shape across the
 * document-extraction-panel + document-card + extraction-fields +
 * pdf-viewer + missing-fields-list components.
 *
 * These mirror what `services/atomic/document-extractor` returns and
 * what `application_documents` stores — the SAME data, two ways to
 * source it (API or DB). The UI doesn't care which.
 */

export type DocType =
  | "10-K"
  | "10-Q"
  | "audited_financials"
  | "AR_aging"
  | "board_minutes"
  | "appraisal"
  | "business_plan";

export type ExtractionStatus =
  | "pending"
  | "extracting"
  | "extracted"
  | "failed"
  | "returned_for_revision";

export interface Citation {
  field_path: string;
  chunk_id: string | null;
  page: number | null;
  bbox: [number, number, number, number] | null;
  excerpt: string | null;
  confidence: number | null;
}

export interface DocumentRecord {
  doc_id: string;
  doc_type: DocType;
  original_filename: string;
  gcs_uri: string;
  file_size_bytes: number;
  extraction_status: ExtractionStatus;
  page_count: number | null;
  confidence: number | null;
  /** Schema-driven extraction output keyed by the doc_type's extraction schema. */
  extracted_fields: Record<string, unknown>;
  citations: Citation[];
  missing_required_fields: string[];
  missing_preferred_fields?: string[];
  error_code: string | null;
  error_message?: string | null;
  uploaded_at: string;
  extracted_at: string | null;
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  "10-K": "Annual report (10-K)",
  "10-Q": "Quarterly report (10-Q)",
  audited_financials: "Audited financials",
  AR_aging: "AR aging",
  board_minutes: "Board minutes",
  appraisal: "Appraisal",
  business_plan: "Business plan",
};
