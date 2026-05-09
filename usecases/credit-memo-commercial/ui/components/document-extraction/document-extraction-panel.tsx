"use client";

/**
 * The per-document panel — first thing the underwriter sees on the case
 * detail page (Track F). Renders one card per uploaded document; each
 * card shows the doc_type badge, extraction status, page count,
 * confidence, missing-fields chip, and an inline extraction-fields
 * table.
 *
 * Layout principle (from agentic-ui-principles): show the work the
 * agents did. The underwriter shouldn't have to dig through events to
 * see what was extracted from each PDF.
 *
 * Loading: while extraction_status='pending' or 'extracting', the card
 * shows a slow-pulse skeleton with the doc_type label visible. No
 * forever-spinning skeletons — Rule 14 (defensive UI).
 */

import * as React from "react";
import { cn } from "@/lib/ui";

import type { DocumentRecord } from "./types";
import { DOC_TYPE_LABELS } from "./types";
import { DocumentCard } from "./document-card";

interface Props {
  documents: DocumentRecord[];
  className?: string;
}

export function DocumentExtractionPanel({
  documents,
  className,
}: Props): React.ReactElement {
  if (!documents || documents.length === 0) {
    return (
      <section
        className={cn(
          "rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          No documents have been uploaded for this application yet.
        </p>
      </section>
    );
  }

  // Sort: extraction_status='extracted' first (banker can dive in),
  // then 'extracting', then 'failed' (need attention), then 'pending'
  const order: Record<string, number> = {
    extracted: 0,
    extracting: 1,
    failed: 2,
    returned_for_revision: 3,
    pending: 4,
  };
  const sorted = [...documents].sort(
    (a, b) =>
      (order[a.extraction_status] ?? 99) - (order[b.extraction_status] ?? 99),
  );

  const counts = sorted.reduce<Record<string, number>>(
    (acc, d) => {
      acc[d.extraction_status] = (acc[d.extraction_status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <section className={cn("space-y-4", className)} aria-label="Document extraction">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Documents and extraction
          </h2>
          <p className="text-sm text-muted-foreground">
            {sorted.length} {sorted.length === 1 ? "document" : "documents"}{" "}
            submitted with this application — see what was extracted from each.
          </p>
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground">
          {counts.extracted ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
              {counts.extracted} extracted
            </span>
          ) : null}
          {counts.failed ? (
            <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">
              {counts.failed} failed
            </span>
          ) : null}
          {counts.extracting || counts.pending ? (
            <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">
              {(counts.extracting ?? 0) + (counts.pending ?? 0)} processing
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-3">
        {sorted.map((d) => (
          <DocumentCard key={d.doc_id} doc={d} />
        ))}
      </div>
    </section>
  );
}
