"use client";

/**
 * Section 6 — Collateral.
 *
 * Items table showing appraised value, haircut, lendable value, lien position;
 * loan amount + coverage ratio summary; narrative.
 */

import * as React from "react";
import { CitationSuperscript } from "../citation-superscript";
import { MemoSection } from "../memo-section";
import { fmtPctFraction, fmtUsdFull, titleCase } from "../format";
import type { Collateral, Citation } from "../types";

interface Props {
  data: Collateral;
}

export const CollateralSection: React.FC<Props> = ({ data }) => {
  const allCites: Citation[] = [
    ...(data.items ?? [])
      .map((i) => i.citation)
      .filter((c): c is Citation => Boolean(c)),
    // Section-level citations (e.g. auto-grounded server-side from
    // extracted balance-sheet/PP&E chunks).
    ...((data as { citations?: Citation[] }).citations ?? []),
  ];
  return (
    <MemoSection
      id="collateral"
      number={6}
      eyebrow="Section 6"
      title="Collateral"
      prefillCitations={allCites}
    >
      {data.narrative && (
        <p>
          {data.narrative}
          {allCites[0] && <CitationSuperscript citation={allCites[0]} />}
        </p>
      )}

      <div className="my-6 overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border">
              <Th>Type</Th>
              <Th>Description</Th>
              <Th align="right">Appraised value</Th>
              <Th align="right">Haircut</Th>
              <Th align="right">Lendable</Th>
              <Th>Lien</Th>
            </tr>
          </thead>
          <tbody>
            {(data.items ?? []).map((it, i) => (
              <tr
                key={`${it.type}-${i}`}
                className="border-b border-border last:border-b-0 align-top"
              >
                <td className="px-4 py-2.5 text-left font-mono text-mono-sm tabular-nums text-foreground/85 whitespace-nowrap">
                  {titleCase(it.type)}
                </td>
                <td className="px-4 py-2.5 text-left font-serif text-body-sm text-foreground max-w-[280px]">
                  {it.description ?? "—"}
                  {it.citation && <CitationSuperscript citation={it.citation} />}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-mono tabular-nums text-foreground">
                  {fmtUsdFull(it.appraised_value_usd)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-mono-sm tabular-nums text-muted-foreground">
                  {fmtPctFraction(it.haircut_pct, 0)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-mono tabular-nums text-foreground font-semi">
                  {fmtUsdFull(it.lendable_value_usd)}
                </td>
                <td className="px-4 py-2.5 text-left font-mono text-mono-sm text-foreground/85 whitespace-nowrap">
                  {it.lien_position ? titleCase(it.lien_position) : "—"}
                  {it.regulation && (
                    <span className="block text-muted-foreground">{it.regulation}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted">
              <th
                colSpan={4}
                scope="row"
                className="px-4 py-2.5 text-left font-mono text-mono-sm uppercase tracking-[0.04em] text-muted-foreground"
              >
                Total lendable
              </th>
              <td className="px-4 py-2.5 text-right font-mono text-mono tabular-nums font-semi text-foreground">
                {fmtUsdFull(data.total_pledged_usd)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Coverage summary */}
      <div className="my-6 grid gap-4 rounded-md border border-border p-5 md:grid-cols-3">
        <Stat label="Loan amount" value={fmtUsdFull(data.loan_amount_usd)} />
        <Stat
          label="Total lendable collateral"
          value={fmtUsdFull(data.total_pledged_usd)}
        />
        <Stat
          label="Coverage"
          value={`${(data.coverage_pct * 100).toFixed(0)}%`}
          sub={
            data.coverage_pct >= 1.25
              ? "Within bank policy (≥125%)"
              : data.coverage_pct >= 1.0
                ? "Below 125% — exception required"
                : "Undercollateralised"
          }
          tone={
            data.coverage_pct >= 1.25
              ? "success"
              : data.coverage_pct >= 1.0
                ? "warning"
                : "danger"
          }
        />
      </div>
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
    } px-4 py-2 font-mono text-mono-sm uppercase tracking-[0.04em] text-muted-foreground`}
  >
    {children}
  </th>
);

const toneClass: Record<string, string> = {
  success: "text-semantic-success",
  warning: "text-semantic-warning",
  danger: "text-semantic-danger",
};

const Stat: React.FC<{
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "warning" | "danger";
}> = ({ label, value, sub, tone }) => (
  <div>
    <p className="text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
      {label}
    </p>
    <p
      className={`mt-1 font-serif text-h3 font-semi tabular-nums ${tone ? toneClass[tone] : "text-foreground"}`}
    >
      {value}
    </p>
    {sub && (
      <p className="mt-0.5 font-mono text-mono-sm text-muted-foreground">{sub}</p>
    )}
  </div>
);
