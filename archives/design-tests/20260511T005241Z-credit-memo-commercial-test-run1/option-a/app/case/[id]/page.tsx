import * as React from "react";
import { StatCard, StatusBadge } from "@fsi-bank/components";
import { ExecutiveHeader } from "../../../components/ExecutiveHeader";
import { DecisionHero } from "../../../components/DecisionHero";
import { RightRail } from "../../../components/RightRail";
import { RuleStrip } from "../../../components/RuleStrip";
import {
  getDecisionCard,
  getExtractedFinancials,
  getGateStatuses,
  LIVE_CASE,
} from "../../../lib/data";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

const fmtCurrency = (n: number, unit: "M" | "raw" = "M"): string => {
  if (unit === "M") return `$${(n / 1).toFixed(0)}M`;
  return new Intl.NumberFormat("en-US").format(n);
};

const RATIONALE =
  "Manufacturer with stable cash flow and conservative leverage; one rule on borrower-exposure aggregation needs watch but base-case underwriting holds.";

/**
 * CASE DETAIL — sparse executive density.
 *
 * Layout: 56px header strip · single hero decision card · rule strip ·
 * 3 stat cards row · tiny right-rail of HITL gate statuses.
 *
 * The page IS the decision card. Everything else is a thin rail or a
 * disclosure. No tabs, no tables, no charts beyond the existing primitives.
 */
export default function CaseDetailPage({ params }: PageProps): JSX.Element {
  const card = getDecisionCard();
  const extr = getExtractedFinancials();
  const gates = getGateStatuses();

  const inc = extr.extracted_fields.income_statement;
  const bs = extr.extracted_fields.balance_sheet;
  const cf = extr.extracted_fields.cash_flow;

  return (
    <main className="flex min-h-screen flex-col">
      <ExecutiveHeader
        caseId={params.id}
        borrowerName={card.borrowerName}
        stage={card.currentStage}
        riskBand={card.riskBand}
        rightAction={{ label: "Approval flow →", href: `/approval/${params.id}` }}
      />

      <div className="flex flex-1 min-h-0">
        <section className="flex-1 px-10 py-10">
          <div className="eyebrow text-ink-3">{LIVE_CASE.title}</div>

          <div className="mt-6">
            <DecisionHero
              decision={card.decision}
              rationale={RATIONALE}
              modelProvider={card.modelProvider}
              pageCount={card.pageCount}
              extractionConfidence={card.extractionConfidence}
            />
          </div>

          <div className="mt-10">
            <RuleStrip />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard
              label="Revenue"
              value={fmtCurrency(inc.revenue)}
              tone="neutral"
              delta={`EBITDA ${fmtCurrency(inc.ebitda)}`}
            />
            <StatCard
              label="Total debt"
              value={fmtCurrency(bs.total_debt)}
              tone="neutral"
              delta={`Equity ${fmtCurrency(bs.total_equity)}`}
            />
            <StatCard
              label="Free cash flow"
              value={fmtCurrency(cf.free_cash_flow)}
              tone="ok"
              delta={`OCF ${fmtCurrency(cf.operating_cash_flow)}`}
            />
          </div>

          <details className="mt-10 rounded-md border border-rule bg-paper-2 px-6 py-4">
            <summary className="cursor-pointer font-mono text-mono-sm text-ink-2">
              Citations &amp; provenance ({extr.citations.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-2">
              {extr.citations.map((c, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-3 font-mono text-mono-sm text-ink-2"
                >
                  <span className="text-ink-3">p.{c.page}</span>
                  <span className="text-ink-1">{c.field_path}</span>
                  <span className="text-ink-3 truncate">{c.excerpt}</span>
                  <StatusBadge kind="info">
                    {Math.round(c.confidence * 100)}%
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </details>
        </section>

        <RightRail
          caseId={params.id}
          gates={gates}
          goApprovalHref={`/approval/${params.id}`}
        />
      </div>
    </main>
  );
}
