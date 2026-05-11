import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { ScoreFactorBars } from "../../../components/ScoreFactorBars";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  USE_CASE_ID,
  getTransaction,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "floor",   label: "Live floor",        icon: "radio",            href: "/" },
  { id: "case",    label: "Transaction",       icon: "inbox" },
  { id: "stepup",  label: "Step-up queue",     icon: "inbox",            href: "/approval/CHL-0001" },
  { id: "rules",   label: "Velocity rules",    icon: "git-branch" },
];

const dollar = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const verbBadge = (v: string): "success" | "danger" | "warning" | "neutral" => {
  if (v === "approve") return "success";
  if (v === "decline") return "danger";
  if (v === "step-up") return "warning";
  return "neutral";
};

export default function TransactionDetailPage({ params }: PageProps): React.ReactElement {
  const tx = getTransaction(params.id);

  // KPI row — 5 numbers about THIS transaction; no business decisions.
  const metrics: Metric[] = [
    { id: "score",     label: "Fraud score",       value: tx.score,            unit: "/ 1000" },
    { id: "verb",      label: "Decision",          value: tx.verb },
    { id: "amount",    label: "Amount",            value: dollar(tx.amount_usd) },
    { id: "latency",   label: "Agent latency",     value: tx.latency_ms,       unit: "ms" },
    { id: "factors",   label: "Score factors",     value: tx.factors.length },
  ];

  return (
    <AppShell
      brand="Payment fraud"
      subtitle="Transaction detail"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Payment fraud"
        caseId={tx.id}
        borrowerName={tx.merchant}
        backHref="/"
        backLabel="Live floor"
      />

      {/* Hero — the one-line identity of the transaction. */}
      <header className="border-b border-rule bg-paper px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">transaction</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {dollar(tx.amount_usd)} · {tx.merchant}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3 tabular-nums">
              <span>{tx.id}</span>
              <span>·</span>
              <span>{tx.clock}</span>
              <span>·</span>
              <span>MCC {tx.mcc}</span>
              <span>·</span>
              <span>{tx.geo}</span>
              <span>·</span>
              <span>NAICS {tx.borrower.naics}</span>
              <span>·</span>
              <span>band {tx.borrower.risk_band}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="info">score {tx.score}</StatusBadge>
            <StatusBadge kind={verbBadge(tx.verb)}>{tx.verb}</StatusBadge>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      {/* Body — the score factor breakdown is the page. No right rail; the
          density-1 dashboard ethos applies here too. */}
      <div className="px-6 py-5">
        <ScoreFactorBars factors={tx.factors} />

        <section
          aria-label="Agent reasoning"
          className="mt-4 rounded-sm border border-rule bg-paper"
        >
          <header className="border-b border-rule px-4 py-2">
            <div className="eyebrow">gray-zone-fraud-scorer</div>
            <h3 className="font-serif text-h4 font-semi text-ink-1">
              Agent reasoning (one-line)
            </h3>
          </header>
          <div className="px-4 py-3 font-mono text-mono-sm leading-relaxed text-ink-2">
            Score {tx.score}/1000. Top contributors: velocity-mcc (+218),
            geo-mismatch (+142), amount-vs-history (+71). Mitigated by
            device-trust (-86), merchant-risk (-32). Decision:{" "}
            <span className="font-semi text-ink-1">{tx.verb}</span>.
            Total agent compute: {tx.latency_ms}ms.
          </div>
        </section>

        <footer className="mt-4 font-mono text-mono-sm text-ink-3">
          <span className="eyebrow">option A · density 1 · throughput</span>
          <span className="ml-3">canvas {CANVAS_SHA256.substring(0, 12)}…</span>
        </footer>
      </div>
    </AppShell>
  );
}
