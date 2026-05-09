"use client";

/**
 * Spreading panel — "the heart of the engine" the user asked to surface.
 *
 * Three-column reading view:
 *   1. Raw extracted line items (per source doc)  ← what came out of the PDFs
 *   2. Normalized values (post-spreader)          ← what the analyst will use
 *   3. Adjustments (signed delta + rationale)     ← banker auditable trail
 *
 * Below, a strip of computed ratios (DSCR, leverage, current ratio, ICR)
 * with thresholds and quality bands. Each ratio has a tooltip that
 * explains the floor/ceiling so an underwriter doesn't have to look up
 * what 1.20x DSCR means.
 *
 * Layout principle: spreadsheet-density on desktop, stacked on narrow.
 * No animations, no spinners — this is a forensics surface.
 */

import * as React from "react";
import { cn } from "@/lib/ui";

import type { LineItemRow, RatioRow, SpreadingViewModel } from "./types";

interface Props {
  data: SpreadingViewModel | null;
  className?: string;
}

function fmtUsd(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtSignedUsd(n: number | null): string {
  if (n === null || n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtUsd(n)}`;
}

const BAND_TONE: Record<RatioRow["band"], string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  concern: "bg-rose-50 text-rose-700 border-rose-200",
};


export function SpreadingDetailPanel({ data, className }: Props): React.ReactElement {
  if (!data) {
    return (
      <section
        className={cn(
          "rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          The spread financials will appear here once Stage 3 (atomic services)
          completes.
        </p>
      </section>
    );
  }

  return (
    <section className={cn("space-y-4", className)} aria-label="Spreading">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">
          Spreading
        </h2>
        <p className="text-sm text-muted-foreground">
          Raw extracted values from {data.source_doc_summaries.length}{" "}
          source document{data.source_doc_summaries.length === 1 ? "" : "s"} on
          the left; normalized values used by every downstream agent on the
          right; per-line-item adjustments with rationale in the middle. Fiscal
          year end {data.fiscal_year_end}.
        </p>
      </header>

      <RawNormalizedTable data={data} />

      <RatioStrip ratios={data.ratios} />
    </section>
  );
}


// ─── Raw / Normalized table ──────────────────────────────────────────────────


function RawNormalizedTable({ data }: { data: SpreadingViewModel }): React.ReactElement {
  const docIds = data.source_doc_summaries.map((d) => d.doc_id);
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-600">
            <th className="px-3 py-2 font-medium">Line item</th>
            {data.source_doc_summaries.map((d) => (
              <th
                key={d.doc_id}
                className="px-3 py-2 font-medium"
                title={d.original_filename}
              >
                {d.doc_type}
              </th>
            ))}
            <th className="px-3 py-2 font-medium text-emerald-700">
              Normalized
            </th>
            <th className="px-3 py-2 font-medium">Adjustment</th>
          </tr>
        </thead>
        <tbody>
          {data.line_items.map((row) => (
            <SpreadRow key={row.path} row={row} docIds={docIds} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpreadRow({
  row,
  docIds,
}: {
  row: LineItemRow;
  docIds: string[];
}): React.ReactElement {
  const hasAdjustment = row.adjustment !== null && row.adjustment !== 0;
  return (
    <tr className={cn("border-b border-slate-100 last:border-b-0", hasAdjustment && "bg-amber-50/30")}>
      <td className="px-3 py-2">
        <div className="font-medium">{row.label}</div>
        <div className="font-mono text-xs text-slate-500">{row.path}</div>
      </td>
      {docIds.map((id) => (
        <td key={id} className="px-3 py-2 tabular-nums text-slate-700">
          {fmtUsd(row.raw_per_doc[id] ?? null)}
        </td>
      ))}
      <td className="px-3 py-2 tabular-nums font-semibold text-emerald-700">
        {fmtUsd(row.normalized)}
      </td>
      <td className="px-3 py-2">
        {hasAdjustment ? (
          <div>
            <div className="tabular-nums font-medium">
              {fmtSignedUsd(row.adjustment)}
            </div>
            {row.adjustment_rationale ? (
              <div className="text-xs text-slate-600">
                {row.adjustment_rationale}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}


// ─── Ratio strip ────────────────────────────────────────────────────────────


function RatioStrip({ ratios }: { ratios: RatioRow[] }): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ratios.map((r) => (
        <div
          key={r.name}
          className={cn(
            "rounded-lg border bg-card p-3",
            BAND_TONE[r.band],
          )}
          title={r.tooltip}
        >
          <div className="text-xs uppercase tracking-wide text-slate-600">
            {r.name}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {r.value !== null ? r.value.toFixed(2) : "—"}
          </div>
          {r.floor !== null || r.ceiling !== null ? (
            <div className="mt-1 text-xs text-slate-600">
              {r.floor !== null ? `min ${r.floor.toFixed(2)}` : ""}
              {r.floor !== null && r.ceiling !== null ? " · " : ""}
              {r.ceiling !== null ? `max ${r.ceiling.toFixed(2)}` : ""}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
