"use client";

import * as React from "react";
import { cn } from "@/lib/ui";

import type { DocumentRecord, ExtractionStatus } from "./types";
import { DOC_TYPE_LABELS } from "./types";
import { ExtractionFieldsTable } from "./extraction-fields";
import { MissingFieldsList } from "./missing-fields-list";

const STATUS_LABEL: Record<ExtractionStatus, string> = {
  pending: "Queued",
  extracting: "Processing",
  extracted: "Extracted",
  failed: "Failed",
  returned_for_revision: "Returned",
};

const STATUS_TONE: Record<ExtractionStatus, string> = {
  pending: "bg-slate-100 text-slate-700 ring-slate-200",
  extracting: "bg-sky-50 text-sky-700 ring-sky-200",
  extracted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  returned_for_revision: "bg-amber-50 text-amber-700 ring-amber-200",
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtConfidence(c: number | null): string {
  if (c === null) return "—";
  return `${(c * 100).toFixed(0)}%`;
}

interface Props {
  doc: DocumentRecord;
}

export function DocumentCard({ doc }: Props): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);
  const isProcessing =
    doc.extraction_status === "pending" || doc.extraction_status === "extracting";
  const isFailed = doc.extraction_status === "failed";
  const hasMissing = (doc.missing_required_fields?.length ?? 0) > 0;

  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm",
        isFailed && "border-rose-300",
        hasMissing &&
          !isFailed &&
          "border-amber-300 bg-amber-50/30",
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                STATUS_TONE[doc.extraction_status],
              )}
            >
              {STATUS_LABEL[doc.extraction_status]}
            </span>
            {doc.confidence !== null && doc.extraction_status === "extracted" ? (
              <span className="text-xs text-muted-foreground">
                conf {fmtConfidence(doc.confidence)}
              </span>
            ) : null}
          </div>
          <h3
            className="mt-1 truncate text-sm font-medium"
            title={doc.original_filename}
          >
            {doc.original_filename}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fmtBytes(doc.file_size_bytes)}
            {doc.page_count ? ` · ${doc.page_count} pp` : ""}
            {doc.citations.length > 0
              ? ` · ${doc.citations.length} citations`
              : ""}
          </p>
        </div>

        {!isProcessing ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-xs font-medium text-sky-700 hover:underline"
            aria-expanded={expanded}
          >
            {expanded ? "Hide details" : "View extraction"}
          </button>
        ) : null}
      </header>

      {/* Failed state — always loud */}
      {isFailed ? (
        <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-900">
          <strong className="block text-rose-900">Extraction failed</strong>
          <code className="mt-0.5 block text-xs text-rose-700">
            {doc.error_code ?? "unknown_error"}
          </code>
          {doc.error_message ? (
            <p className="mt-1 text-xs text-rose-700">{doc.error_message}</p>
          ) : null}
          <p className="mt-2 text-xs text-rose-700">
            The applicant must re-upload a clean PDF. The application is on hold
            until this resolves.
          </p>
        </div>
      ) : null}

      {/* Processing state */}
      {isProcessing ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-sky-700">
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500"
            aria-hidden
          />
          Processing — Landing AI ADE typically takes 30–90 seconds per
          document.
        </div>
      ) : null}

      {/* Missing-fields chip — visible without expansion */}
      {hasMissing && !isFailed ? (
        <div className="mt-3 text-xs text-amber-800">
          <strong>{doc.missing_required_fields.length}</strong> required field
          {doc.missing_required_fields.length === 1 ? "" : "s"} missing —{" "}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="font-medium underline"
          >
            review
          </button>
        </div>
      ) : null}

      {/* Expanded — extraction fields + missing list */}
      {expanded && doc.extraction_status === "extracted" ? (
        <div className="mt-4 space-y-4 border-t pt-4">
          {hasMissing ? (
            <MissingFieldsList
              required={doc.missing_required_fields}
              preferred={doc.missing_preferred_fields ?? []}
            />
          ) : null}
          <ExtractionFieldsTable doc={doc} />
        </div>
      ) : null}
    </article>
  );
}
