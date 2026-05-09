"use client";

/**
 * Section 9 — Risk Rating Rationale.
 *
 * Drivers table (factor / assessment / evidence), identified weaknesses with
 * mitigations, narrative tying it together. Risk band is shown as a kicker
 * badge in the section header.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { CitationSuperscript } from "../citation-superscript";
import { MemoSection } from "../memo-section";
import { riskBandLabel, titleCase } from "../format";
import type { RiskRatingRationale, Citation } from "../types";

interface Props {
  data: RiskRatingRationale;
}

const bandTone = (band: string | null | undefined) => {
  const b = String(band ?? "");
  if (b.startsWith("1")) return "success" as const;
  if (b.startsWith("2") || b.startsWith("3")) return "warning" as const;
  if (b.startsWith("4") || b.startsWith("5")) return "danger" as const;
  return "neutral" as const;
};

const assessmentTone = (a: string): "success" | "warning" | "danger" => {
  if (a === "strong") return "success";
  if (a === "adequate") return "success";
  if (a === "weak") return "warning";
  return "danger";
};

export const RiskRatingRationaleSection: React.FC<Props> = ({ data }) => {
  const cites: Citation[] = (data.drivers ?? [])
    .map((d) => d.citation)
    .filter((c): c is Citation => Boolean(c));
  return (
    <MemoSection
      id="risk_rating_rationale"
      number={9}
      eyebrow="Section 9"
      title="Risk Rating Rationale"
      prefillCitations={cites}
      kicker={
        <Badge tone={bandTone(data.risk_band)} dot>
          {riskBandLabel(data.risk_band)}
        </Badge>
      }
    >
      {data.narrative && (
        <p>
          {data.narrative}
          {cites[0] && <CitationSuperscript citation={cites[0]} />}
        </p>
      )}

      <div className="my-6 overflow-hidden rounded-md border border-border">
        <p className="border-b border-border bg-muted px-4 py-2 text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
          Rating drivers
        </p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <Th>Factor</Th>
              <Th>Assessment</Th>
              <Th>Evidence</Th>
            </tr>
          </thead>
          <tbody>
            {(data.drivers ?? []).map((d, i) => (
              <tr
                key={`${d.factor}-${i}`}
                className="border-b border-border last:border-b-0 align-top"
              >
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-serif text-body-sm font-semi text-foreground whitespace-nowrap"
                >
                  {d.factor}
                </th>
                <td className="px-4 py-3 text-left">
                  <Badge tone={assessmentTone(d.assessment)} dot>
                    {titleCase(d.assessment)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-left font-serif text-body-sm text-foreground leading-snug">
                  {d.evidence}
                  {d.citation && <CitationSuperscript citation={d.citation} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.identified_weaknesses && data.identified_weaknesses.length > 0 && (
        <div className="my-6 rounded-md border border-border p-5">
          <p className="mb-3 text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
            Identified weaknesses & mitigations
          </p>
          <ul className="flex flex-col divide-y divide-rule">
            {data.identified_weaknesses.map((w, i) => (
              <li
                key={i}
                className="grid gap-1 py-3 first:pt-0 last:pb-0 md:grid-cols-2"
              >
                <p className="font-serif text-body-sm font-semi text-foreground leading-snug">
                  {w.weakness}
                </p>
                <p className="font-serif text-body-sm text-foreground/85 leading-snug">
                  {w.mitigation}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="font-mono text-mono-sm text-muted-foreground">
        Rating framework: {data.occ_handbook_citation ?? "OCC Comptroller's Handbook: Rating Credit Risk"}
      </p>
    </MemoSection>
  );
};

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th
    scope="col"
    className="px-4 py-2 text-left font-mono text-mono-sm uppercase tracking-[0.04em] text-muted-foreground"
  >
    {children}
  </th>
);
