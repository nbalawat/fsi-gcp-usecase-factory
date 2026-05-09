"use client";

/**
 * Section 5 — Risk Factors.
 *
 * Each risk has a numbered card: name (serif H4), severity bar (1-10), evidence
 * paragraph, mitigation paragraph. Bar fills from green (1-3) → amber (4-6) →
 * red (7-10).
 */

import * as React from "react";
import { cn } from "@/lib/ui";
import { CitationSuperscript } from "../citation-superscript";
import { MemoSection } from "../memo-section";
import { severityClass, severityTextClass, severityTier } from "../format";
import type { RiskFactors, Citation } from "../types";

interface Props {
  data: RiskFactors;
}

export const RiskFactorsSection: React.FC<Props> = ({ data }) => {
  // Aggregate every factor's citations into the section prefill.
  const factors = data.factors ?? [];
  const allCites: Citation[] = factors.flatMap((f) => f.citations ?? []);
  return (
    <MemoSection
      id="risk_factors"
      number={5}
      eyebrow="Section 5"
      title="Risk Factors"
      prefillCitations={allCites}
    >
      <p>
        The following risks have been identified and ranked by underwriting on
        a 1–10 severity scale. Each risk includes the supporting evidence and
        the proposed mitigation. The aggregate risk profile is reflected in the
        recommended risk rating in Section 9.
      </p>

      <ol className="mt-6 flex flex-col gap-4">
        {(data.factors ?? []).map((f, i) => {
          const tier = severityTier(f.severity_1_10);
          return (
            <li
              key={f.name}
              className="rounded-md border border-border p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-serif text-h4 font-semi text-foreground">
                  <span className="mr-2 font-mono text-mono-sm text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}.
                  </span>
                  {f.name}
                </h3>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "font-mono text-mono-sm font-semi",
                      severityTextClass[tier],
                    )}
                  >
                    Severity {f.severity_1_10}/10
                  </span>
                  <SeverityBar value={f.severity_1_10} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
                    Evidence
                  </p>
                  <p className="mt-2 font-serif text-body-sm text-foreground leading-snug">
                    {f.evidence}
                    {f.citations?.[0] && (
                      <CitationSuperscript citation={f.citations[0]} />
                    )}
                    {f.citations?.[1] && (
                      <CitationSuperscript citation={f.citations[1]} />
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
                    Mitigation
                  </p>
                  <p className="mt-2 font-serif text-body-sm text-foreground leading-snug">
                    {f.mitigation}
                    {f.citations?.[2] && (
                      <CitationSuperscript citation={f.citations[2]} />
                    )}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </MemoSection>
  );
};

const SeverityBar: React.FC<{ value: number }> = ({ value }) => {
  const tier = severityTier(value);
  const fillClass = severityClass[tier];
  return (
    <div
      role="meter"
      aria-valuenow={value}
      aria-valuemin={1}
      aria-valuemax={10}
      aria-label={`Severity ${value} of 10`}
      className="flex items-center gap-0.5"
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-3 w-1.5 rounded-[1px]",
            i < value ? fillClass : "bg-muted/70 border border-border",
          )}
        />
      ))}
    </div>
  );
};
