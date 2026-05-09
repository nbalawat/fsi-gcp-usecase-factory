"use client";

/**
 * Renders the extracted_fields object as a flat table of
 *   field path  |  value  |  citation
 * The citation is a clickable badge that opens the source PDF page in
 * a viewer. (For MVP the badge shows page + chunk_id; the PDF viewer
 * itself is wired in pdf-viewer.tsx.)
 */

import * as React from "react";
import type { Citation, DocumentRecord } from "./types";

function flatten(
  obj: unknown,
  path: string = "",
): Array<{ path: string; value: unknown }> {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object" || Array.isArray(obj)) {
    return [{ path, value: obj }];
  }
  const out: Array<{ path: string; value: unknown }> = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const child = path ? `${path}.${k}` : k;
    out.push(...flatten(v, child));
  }
  return out;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
    return String(v);
  }
  if (Array.isArray(v)) return `[${v.length}]`;
  return String(v);
}

interface Props {
  doc: DocumentRecord;
}

export function ExtractionFieldsTable({ doc }: Props): React.ReactElement {
  const citations: Map<string, Citation> = new Map();
  for (const c of doc.citations) citations.set(c.field_path, c);

  const rows = flatten(doc.extracted_fields).filter(
    (r) => r.value !== null && r.value !== undefined && r.value !== "",
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No fields were populated by the extraction.
      </p>
    );
  }

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">
        Extracted fields ({rows.length})
      </h4>
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-2/5 py-2 font-medium">Field</th>
            <th className="w-2/5 py-2 font-medium">Value</th>
            <th className="w-1/5 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ path, value }) => {
            const c = citations.get(path);
            return (
              <tr key={path} className="border-b border-slate-100">
                <td className="py-1.5 font-mono text-xs text-slate-600">
                  {path}
                </td>
                <td className="py-1.5 tabular-nums">{fmtValue(value)}</td>
                <td className="py-1.5">
                  {c && c.page ? (
                    <button
                      type="button"
                      className="rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                      title={c.excerpt ?? undefined}
                      onClick={() => {
                        // PDF viewer integration — fires a custom event
                        // the parent wires to scroll/highlight
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(
                            new CustomEvent("doc-citation-click", {
                              detail: { doc_id: doc.doc_id, citation: c },
                            }),
                          );
                        }
                      }}
                    >
                      p. {c.page}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
