import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatCard,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import {
  CANVAS_SHA256,
  LIVE_CASE,
  MODEL_PROVIDER,
  USE_CASE_ID,
  getCase,
  summarize,
  thresholdRows,
  toLedger,
  verdictBadge,
} from "../lib/data";
import { ThresholdLedger } from "../components/ThresholdLedger";
import { CitationChain } from "../components/CitationChain";

const NAV: NavItem[] = [
  { id: "exam", label: "Exam workbench", icon: "layout-dashboard", href: "/" },
  { id: "facility", label: "Facility", icon: "inbox", href: `/case/${LIVE_CASE.id}` },
  { id: "booking", label: "Reserve booking", icon: "activity", href: `/approval/${LIVE_CASE.id}` },
  { id: "rules", label: "Threshold ledger", icon: "git-branch" },
];

/**
 * Home page — the OCC examiner's cover sheet for the bank's CRE
 * surveillance run. Every claim on this page traces to a citation; the
 * page IS the examiner's view.
 */
export default function HomePage(): React.ReactElement {
  const c = getCase(LIVE_CASE.id);
  const sum = summarize(c);
  const ledger = toLedger(c.events);
  const thresholds = thresholdRows();

  // Worst-case verdict drives the cover-sheet tone.
  const worstVerdict = thresholds.reduce<"pass" | "watch" | "fail">(
    (acc, t) => {
      if (acc === "fail") return acc;
      if (t.verdict === "fail") return "fail";
      if (t.verdict === "watch" && acc !== "fail") return "watch";
      return acc;
    },
    "pass",
  );

  const metrics: Metric[] = [
    {
      id: "thresholds",
      label: "Thresholds evaluated",
      value: sum.thresholdsEvaluated,
      tooltip: "Total bank-policy + regulatory thresholds run on this facility",
    },
    {
      id: "breaches",
      label: "Watch / breach",
      value: sum.thresholdsBreached,
      state: sum.thresholdsBreached > 0 ? "warning" : "ok",
    },
    {
      id: "citations",
      label: "Citations cited",
      value: sum.citationsCovered,
      tooltip: "Distinct regulatory or policy citations on the audit trail",
    },
    {
      id: "gates",
      label: "Gates decided",
      value: `${sum.gatesDecided} / ${sum.gatesTotal}`,
      state: sum.gatesDecided === sum.gatesTotal ? "ok" : "warning",
    },
    {
      id: "ledger",
      label: "Ledger entries",
      value: sum.totalEntries,
      tooltip: "Total events in the supervisory exam log",
    },
  ];

  // The 4 most material ledger entries — pinned to the cover sheet.
  const headlineEntries = ledger
    .filter(
      (r) =>
        r.kind === "hitl_pending" ||
        r.kind === "hitl_decided" ||
        r.kind === "agent_reasoning",
    )
    .slice(0, 4);

  return (
    <AppShell
      brand="CRE Surveillance"
      subtitle="Examiner workbench"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="exam"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CRE Surveillance"
        backHref="/"
        backLabel="Exam workbench"
      />

      <header className="border-b border-rule bg-paper px-6 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Supervisory examination · 2026 Q2</div>
            <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
              {c.title}
            </h1>
            <p className="mt-2 max-w-3xl text-body-sm text-ink-3">
              This workbench presents every CRE concentration finding the way
              an OCC examiner would expect to read it: every threshold cites
              its policy section; every agent action cites its workflow stage;
              every reviewer disposition cites the authority that granted it.
              Read top to bottom — the page is the chain of custody.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind={verdictBadge(worstVerdict)}>
              overall · {worstVerdict}
            </StatusBadge>
            <span className="font-mono text-mono-sm text-ink-3">
              canvas · {CANVAS_SHA256.substring(0, 8)}…
            </span>
            <Link
              href={`/case/${c.id}`}
              className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-ink-1 hover:bg-accent-hover"
            >
              Open facility examination →
            </Link>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <section className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard
          label="Region exposure"
          value="$1.84B"
          unit="Northeast"
          delta="14.2% of risk-based capital"
          tone="warning"
        />
        <StatCard
          label="Specific reserves YTD"
          value="$32M"
          unit="2026"
          delta="+$8M vs 2025"
          tone="neutral"
        />
        <StatCard
          label="Examiner ETA"
          value="42"
          unit="days"
          delta="next on-site review window"
          tone="neutral"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-2">
        <div>
          <ThresholdLedger rows={thresholds} />
        </div>
        <div className="rounded-md border border-rule bg-paper">
          <header className="border-b border-rule px-4 py-3">
            <div className="eyebrow">Material findings</div>
            <h3 className="font-serif text-h3 font-semi text-ink-1">
              Top entries on the exam log
            </h3>
          </header>
          <ol className="flex flex-col">
            {headlineEntries.map((row) => (
              <li
                key={row.idx}
                className="flex flex-col gap-1 border-b border-rule px-4 py-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-mono-sm text-ink-3">
                    {row.at.substring(0, 19).replace("T", " ")} UTC
                  </span>
                  <StatusBadge
                    kind={row.kind === "hitl_pending" ? "warning" : "neutral"}
                  >
                    {row.kind.replace("_", " ")}
                  </StatusBadge>
                </div>
                <div className="text-ui text-ink-1">{row.headline}</div>
                {row.citations.length > 0 && (
                  <div className="mt-1">
                    <CitationChain citations={row.citations} />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="border-t border-rule px-4 py-3">
            <Link
              href={`/case/${c.id}`}
              className="font-mono text-mono-sm text-accent-pressed hover:underline"
            >
              See complete supervisory exam log →
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
