"use client";

/**
 * Section 2 — Borrower Overview.
 *
 * Business description (narrative paragraph), ownership table, management
 * roster, customer + supplier concentration, related-party transactions.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { CitationSuperscript } from "../citation-superscript";
import { MemoSection } from "../memo-section";
import { fmtPctFraction } from "../format";
import type { BorrowerOverview } from "../types";

interface Props {
  data: BorrowerOverview;
}

export const BorrowerOverviewSection: React.FC<Props> = ({ data }) => {
  const cites = data.citations ?? [];
  return (
    <MemoSection
      id="borrower_overview"
      number={2}
      eyebrow="Section 2"
      title="Borrower Overview"
      prefillCitations={cites}
    >
      <p>
        {data.business_description}
        {cites[0] && <CitationSuperscript citation={cites[0]} />}
      </p>

      {/* Ownership */}
      {data.ownership && data.ownership.length > 0 && (
        <div className="my-6">
          <p className="mb-2 text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
            Ownership
          </p>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <Th>Beneficial owner</Th>
                  <Th>Role</Th>
                  <Th align="right">Stake</Th>
                  <Th align="right">Insider</Th>
                </tr>
              </thead>
              <tbody>
                {data.ownership.map((o) => (
                  <tr
                    key={o.name}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-2.5 text-left font-serif text-body-sm font-semi text-foreground">
                      {o.name}
                    </td>
                    <td className="px-4 py-2.5 text-left font-serif text-body-sm text-foreground/85">
                      {o.role}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-mono tabular-nums text-foreground">
                      {fmtPctFraction(o.stake_pct, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {o.is_insider ? (
                        <Badge tone="warning" dot>
                          12 CFR 215.5
                        </Badge>
                      ) : (
                        <span className="font-mono text-mono-sm text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Management */}
      {data.management_team && data.management_team.length > 0 && (
        <div className="my-6">
          <p className="mb-2 text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
            Senior management
          </p>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <Th>Role</Th>
                  <Th>Officer</Th>
                  <Th align="right">Tenure</Th>
                  <Th>Background</Th>
                </tr>
              </thead>
              <tbody>
                {data.management_team.map((m) => (
                  <tr
                    key={`${m.role}-${m.name}`}
                    className="border-b border-border last:border-b-0 align-top"
                  >
                    <td className="px-4 py-2.5 text-left font-mono text-mono-sm tabular-nums text-foreground/85">
                      {m.role}
                    </td>
                    <td className="px-4 py-2.5 text-left font-serif text-body-sm font-semi text-foreground whitespace-nowrap">
                      {m.name}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-mono tabular-nums text-foreground">
                      {m.tenure_years.toFixed(1)}y
                    </td>
                    <td className="px-4 py-2.5 text-left font-serif text-body-sm text-foreground/85 max-w-[420px]">
                      {m.background ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer concentration */}
      <div className="my-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border p-5">
          <p className="text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
            Customer concentration
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat
              label="Top 1 customer"
              value={fmtPctFraction(data.customer_concentration?.top_1_pct, 1)}
            />
            <Stat
              label="Top 5 customers"
              value={fmtPctFraction(data.customer_concentration?.top_5_pct, 1)}
            />
            {data.customer_concentration?.hhi != null && (
              <Stat
                label="HHI"
                value={Number(data.customer_concentration.hhi).toFixed(0)}
              />
            )}
          </div>
          {data.customer_concentration?.narrative && (
            <p className="mt-3 font-serif text-body-sm text-foreground/85 leading-snug">
              {data.customer_concentration.narrative}
              {cites[1] && <CitationSuperscript citation={cites[1]} />}
            </p>
          )}
        </div>

        {data.supplier_concentration && (
          <div className="rounded-md border border-border p-5">
            <p className="text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
              Supplier concentration
            </p>
            <div className="mt-3">
              {data.supplier_concentration.top_1_pct != null && (
                <Stat
                  label="Top supplier"
                  value={fmtPctFraction(
                    data.supplier_concentration.top_1_pct,
                    1,
                  )}
                />
              )}
            </div>
            {data.supplier_concentration.narrative && (
              <p className="mt-3 font-serif text-body-sm text-foreground/85 leading-snug">
                {data.supplier_concentration.narrative}
                {cites[2] && <CitationSuperscript citation={cites[2]} />}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Related-party */}
      {data.related_party_transactions &&
        data.related_party_transactions.length > 0 && (
          <div className="my-6 rounded-md border border-semantic-warning/40 bg-semantic-warningTint/30 p-5">
            <p className="text-eyebrow uppercase tracking-[0.06em] text-semantic-warning font-mono">
              Related-party transactions
            </p>
            <ul className="ml-5 mt-2 list-disc font-serif text-body-sm text-foreground leading-snug">
              {data.related_party_transactions.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
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
    } px-4 py-2 font-mono text-mono-sm uppercase tracking-[0.04em] text-muted-foreground`}
  >
    {children}
  </th>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
      {label}
    </p>
    <p className="mt-1 font-mono text-mono tabular-nums text-foreground">{value}</p>
  </div>
);
