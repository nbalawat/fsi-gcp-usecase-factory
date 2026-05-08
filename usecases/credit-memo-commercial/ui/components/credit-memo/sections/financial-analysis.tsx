"use client";

/**
 * Section 3 — Financial Analysis.
 *
 * Normalisation adjustments table → 3-yr trend table → peer comparison →
 * narrative. The financial spreader output flows in here verbatim.
 */

import * as React from "react";
import { CitationSuperscript } from "../citation-superscript";
import { MemoSection } from "../memo-section";
import { TrendTable } from "../memo-tables/trend-table";
import { PeerComparisonTable } from "../memo-tables/peer-comparison-table";
import { fmtUsdFull } from "../format";
import type { FinancialAnalysis } from "../types";

interface Props {
  data: FinancialAnalysis;
}

export const FinancialAnalysisSection: React.FC<Props> = ({ data }) => {
  const cites = data.citations ?? [];
  return (
    <MemoSection
      id="financial_analysis"
      number={3}
      eyebrow="Section 3"
      title="Financial Analysis"
      prefillCitations={cites}
    >
      <p>
        {data.narrative}
        {cites[0] && <CitationSuperscript citation={cites[0]} />}
        {cites[1] && <CitationSuperscript citation={cites[1]} />}
      </p>

      {data.normalization_adjustments &&
        data.normalization_adjustments.length > 0 && (
          <div className="my-6">
            <p className="mb-2 text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
              Normalisation adjustments
            </p>
            <div className="overflow-hidden rounded-md border border-rule">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-rule">
                    <Th>Period</Th>
                    <Th>Line item</Th>
                    <Th align="right">Original</Th>
                    <Th align="right">Adjusted</Th>
                    <Th align="right">Δ</Th>
                    <Th>Rationale</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.normalization_adjustments.map((a, i) => {
                    const delta = a.adjusted_value - a.original_value;
                    return (
                      <tr
                        key={`${a.period}-${a.line_item}-${i}`}
                        className="border-b border-rule last:border-b-0 align-top"
                      >
                        <td className="px-4 py-2.5 text-left font-mono text-mono-sm tabular-nums text-ink-2">
                          {a.period}
                        </td>
                        <td className="px-4 py-2.5 text-left font-serif text-body-sm font-semi text-ink-1">
                          {a.line_item}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-mono-sm tabular-nums text-ink-3">
                          {fmtUsdFull(a.original_value)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-mono tabular-nums text-ink-1">
                          {fmtUsdFull(a.adjusted_value)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono text-mono-sm tabular-nums ${delta > 0 ? "text-semantic-success" : delta < 0 ? "text-semantic-warning" : "text-ink-3"}`}
                        >
                          {delta > 0 ? "+" : ""}
                          {fmtUsdFull(delta)}
                        </td>
                        <td className="px-4 py-2.5 text-left font-serif text-body-sm text-ink-2 max-w-[360px]">
                          {a.rationale}
                          {a.citation && (
                            <CitationSuperscript citation={a.citation} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      <TrendTable
        caption={`Financial trend — ${(data.trend_table?.periods ?? []).join(" / ")}`}
        periods={data.trend_table?.periods ?? []}
        rows={data.trend_table?.rows ?? []}
      />

      <PeerComparisonTable
        rows={data.peer_comparison?.rows ?? []}
        data_source={data.peer_comparison?.data_source}
        peer_count={data.peer_comparison?.peer_count ?? null}
        naics_code={data.peer_comparison?.naics_code ?? ""}
      />

      {cites[2] && (
        <p className="text-body-sm text-ink-3">
          Peer benchmarks sourced from{" "}
          {data.peer_comparison?.data_source ?? "RMA Annual Statement Studies"}.
          <CitationSuperscript citation={cites[2]} />
        </p>
      )}
    </MemoSection>
  );
};

const Th: React.FC<{
  children: React.ReactNode;
  align?: "left" | "right";
}> = ({ children, align = "left" }) => (
  <th
    scope="col"
    className={`${
      align === "right" ? "text-right" : "text-left"
    } px-4 py-2 font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3`}
  >
    {children}
  </th>
);
