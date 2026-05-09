"use client";

/**
 * Section 7 — Covenant Package.
 *
 * Maintenance + incurrence covenants and reporting cadence. Maintenance covs
 * use the dedicated <CovenantTable> for the typeset look; incurrence covs are
 * a simpler bullet-style block.
 */

import * as React from "react";
import { CitationSuperscript } from "../citation-superscript";
import { MemoSection } from "../memo-section";
import { CovenantTable } from "../memo-tables/covenant-table";
import { titleCase } from "../format";
import type { CovenantPackage } from "../types";

interface Props {
  data: CovenantPackage;
}

export const CovenantPackageSection: React.FC<Props> = ({ data }) => {
  const cites = data.citations ?? [];
  return (
    <MemoSection
      id="covenant_package"
      number={7}
      eyebrow="Section 7"
      title="Covenant Package"
      prefillCitations={cites}
    >
      {data.narrative && (
        <p>
          {data.narrative}
          {cites[0] && <CitationSuperscript citation={cites[0]} />}
        </p>
      )}

      <CovenantTable covenants={data.maintenance_covenants} />

      {data.incurrence_covenants && data.incurrence_covenants.length > 0 && (
        <div className="my-6 rounded-md border border-border p-5">
          <p className="mb-3 text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
            Incurrence covenants
          </p>
          <ul className="flex flex-col gap-2">
            {data.incurrence_covenants.map((c, i) => (
              <li
                key={`${c.name}-${i}`}
                className="flex items-baseline gap-3 font-serif text-body-sm text-foreground leading-snug"
              >
                <span className="font-mono text-mono-sm text-primary font-semi whitespace-nowrap">
                  {titleCase(c.name)}
                </span>
                <span className="text-foreground/85">{c.applies_when}</span>
                {c.threshold != null && (
                  <span className="font-mono text-mono-sm tabular-nums text-foreground whitespace-nowrap">
                    {String(c.threshold)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="my-6 rounded-md border border-border p-5">
        <p className="text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
          Reporting cadence
        </p>
        <p className="mt-2 font-serif text-body text-foreground leading-snug">
          {data.reporting_cadence}
          {cites[1] && <CitationSuperscript citation={cites[1]} />}
        </p>
      </div>
    </MemoSection>
  );
};
