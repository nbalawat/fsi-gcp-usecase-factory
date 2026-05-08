"use client";

/**
 * Section 4 — Cash Flow Projection.
 *
 * Renders the assumptions block, the scenario matrix, and the narrative. The
 * matrix is the heart of the section: base / downside / recession / rate-shock
 * with year-3 outcomes for revenue, EBITDA, debt service, DSCR, leverage, and
 * covenant headroom.
 */

import * as React from "react";
import { CitationSuperscript } from "../citation-superscript";
import { MemoSection } from "../memo-section";
import { ScenarioMatrix } from "../memo-tables/scenario-matrix";
import { fmtPctFraction } from "../format";
import type { CashFlowProjection } from "../types";

interface Props {
  data: CashFlowProjection;
}

export const CashFlowProjectionSection: React.FC<Props> = ({ data }) => {
  const cites = data.citations ?? [];
  const a = data.assumptions ?? {};
  return (
    <MemoSection
      id="cash_flow_projection"
      number={4}
      eyebrow="Section 4"
      title="Cash Flow Projection"
      prefillCitations={cites}
    >
      <p>
        {data.narrative}
        {cites[0] && <CitationSuperscript citation={cites[0]} />}
      </p>

      {/* Assumptions */}
      <div className="my-6 grid gap-3 rounded-md border border-rule p-5 md:grid-cols-4">
        {a.revenue_cagr != null && (
          <Stat label="Revenue CAGR" value={fmtPctFraction(a.revenue_cagr, 1)} />
        )}
        {a.ebitda_margin != null && (
          <Stat label="EBITDA margin" value={fmtPctFraction(a.ebitda_margin, 1)} />
        )}
        {a.capex_pct_revenue != null && (
          <Stat
            label="Capex / revenue"
            value={fmtPctFraction(a.capex_pct_revenue, 1)}
          />
        )}
        {a.working_capital_days && (
          <Stat
            label="Working capital"
            value={`DSO ${a.working_capital_days.dso ?? "—"} · DPO ${a.working_capital_days.dpo ?? "—"} · Inv ${a.working_capital_days.inventory_days ?? "—"}`}
            small
          />
        )}
      </div>

      {a.narrative && (
        <p className="text-body-sm text-ink-2">
          {a.narrative}
          {cites[1] && <CitationSuperscript citation={cites[1]} />}
        </p>
      )}

      <ScenarioMatrix scenarios={data.scenarios ?? []} />

      {/* Per-scenario interpretations */}
      <div className="my-6 grid gap-3 md:grid-cols-2">
        {(data.scenarios ?? [])
          .filter((s) => s.interpretation)
          .map((s, i) => {
            const c = cites[2 + i];
            return (
              <div
                key={s.name}
                className="rounded-md border border-rule p-4"
              >
                <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
                  {s.label ?? s.name}
                </p>
                <p className="mt-2 font-serif text-body-sm text-ink-1 leading-snug">
                  {s.interpretation}
                  {c && <CitationSuperscript citation={c} />}
                </p>
              </div>
            );
          })}
      </div>
    </MemoSection>
  );
};

const Stat: React.FC<{
  label: string;
  value: string;
  small?: boolean;
}> = ({ label, value, small }) => (
  <div>
    <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
      {label}
    </p>
    <p
      className={
        small
          ? "mt-1 font-mono text-mono-sm tabular-nums text-ink-1"
          : "mt-1 font-mono text-mono tabular-nums text-ink-1"
      }
    >
      {value}
    </p>
  </div>
);
