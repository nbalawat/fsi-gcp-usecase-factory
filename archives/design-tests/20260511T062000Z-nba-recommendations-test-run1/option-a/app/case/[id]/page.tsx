import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { RecDetail } from "../../../components/RecDetail";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  USE_CASE_ID,
  fmtUsdCompact,
  getRec,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "queue", label: "Queue", icon: "inbox", href: "/" },
  { id: "case", label: "This recommendation", icon: "activity" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

/**
 * Single recommendation detail page. The seed says: "Detail view is
 * for when RM wants to drill in." So we surface what the row hid:
 * full rationale, agent trail, fit-score, and the same disposition
 * controls (so the RM can act here too, without going back).
 */
export default function CaseDetailPage({
  params,
}: PageProps): React.ReactElement {
  const rec = getRec(params.id);

  const metrics: Metric[] = [
    {
      id: "confidence",
      label: "Model confidence",
      value: `${(rec.confidence * 100).toFixed(0)}%`,
      tooltip: "Agent's score for this recommendation",
    },
    {
      id: "fit",
      label: "Customer-product fit",
      value: `${(rec.fitScore * 100).toFixed(0)}%`,
    },
    {
      id: "uplift",
      label: "Annualised uplift",
      value: fmtUsdCompact(rec.upliftUsd),
      unit: "/ yr",
    },
    {
      id: "reg",
      label: "Regulatory",
      value: rec.regulatoryClear ? "clear" : "watch",
      state: rec.regulatoryClear ? "ok" : "warning",
    },
    {
      id: "disposition",
      label: "Status",
      value: rec.disposition,
    },
  ];

  return (
    <AppShell
      brand="Next-best-action"
      subtitle="Recommendation detail"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Next-best-action"
        caseId={rec.id}
        borrowerName={rec.borrower.name}
        backHref="/"
        backLabel="Queue"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Recommendation · drill-in</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {rec.borrower.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{rec.id}</span>
              <span>·</span>
              <span>NAICS {rec.borrower.naics}</span>
              <span>·</span>
              <span>{rec.borrower.geo}</span>
              <span>·</span>
              <span>band {rec.borrower.risk_band}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              ← Back to queue
            </a>
            <a
              href={`/approval/${rec.id}`}
              className="rounded-sm bg-brandBlack px-3 py-1 font-mono text-mono-sm font-semi text-paper hover:bg-ink-2"
            >
              Send to customer →
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="px-6 py-5">
        <RecDetail rec={rec} />
        <div className="mt-6 font-mono text-mono-sm text-ink-3">
          Canvas SHA-256 · {CANVAS_SHA256.substring(0, 16)}…
        </div>
      </div>
    </AppShell>
  );
}
