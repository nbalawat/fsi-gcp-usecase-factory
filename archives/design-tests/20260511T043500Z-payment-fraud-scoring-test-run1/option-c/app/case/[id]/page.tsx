import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatCard,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { CaseDisposition } from "../../../components/CaseDisposition";
import { TranscriptRow } from "../../../components/TranscriptRow";
import {
  CANVAS_SHA256,
  DECLINE_REASONS,
  LIVE_DECLINES,
  MODEL_PROVIDER,
  SEED_CANVAS_SHA256,
  USE_CASE_ID,
  getDecline,
  toTranscript,
  PIPELINE_EVENTS,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "live", label: "Decline stream", icon: "radio", href: "/" },
  { id: "case", label: "This transaction", icon: "inbox" },
  { id: "approval", label: "Bulk tuning", icon: "activity", href: "/approval/SAMPLE" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const decline = getDecline(params.id);
  const rows = toTranscript(PIPELINE_EVENTS);

  const metrics: Metric[] = [
    {
      id: "score",
      label: "Fraud score",
      value: decline.score.toFixed(2),
      state: decline.score >= 0.8 ? "alert" : "warning",
    },
    {
      id: "reasons",
      label: "Decline reasons",
      value: decline.reasonIds.length,
    },
    {
      id: "amount",
      label: "Auth amount",
      value: decline.amountUsd.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    },
    {
      id: "corridor",
      label: "Corridor",
      value: decline.corridor,
    },
    {
      id: "disposition",
      label: "Disposition",
      value: decline.disposition,
      state: decline.disposition === "decline" ? "alert" : "warning",
    },
  ];

  const approvalHref = `/approval/${decline.id}`;

  return (
    <AppShell
      brand="Payment Fraud"
      subtitle="Decline-reason actionable"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Payment Fraud"
        caseId={decline.id}
        borrowerName={decline.customer}
        backHref="/"
        backLabel="Decline stream"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
              Declined transaction
            </div>
            <h1 className="font-serif text-2xl font-semibold text-ink-1">
              {decline.merchant} · {decline.amountUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{decline.id}</span>
              <span>·</span>
              <span>{decline.customer}</span>
              <span>·</span>
              <span>{decline.corridor}</span>
              <span>·</span>
              <span>score {decline.score.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge
              kind={decline.disposition === "decline" ? "danger" : "warning"}
            >
              {decline.disposition}
            </StatusBadge>
            <a
              href={approvalHref}
              className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:opacity-90"
            >
              Open bulk tuner →
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        {/* Main column — disposition surface: one reason per card, each
            with its own inline action buttons. */}
        <CaseDisposition decline={decline} />

        {/* Right rail — processing transcript + reason index + canvas pin */}
        <aside className="flex flex-col gap-4">
          <section
            aria-label="Processing transcript"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
                Processing transcript
              </div>
              <h3 className="text-base font-semibold text-ink-1">
                Agent / service path
              </h3>
            </header>
            <ol className="flex flex-col">
              {rows.map((r) => (
                <TranscriptRow key={r.idx} row={r} />
              ))}
            </ol>
          </section>

          <section
            aria-label="Reason index"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
                Reason index
              </div>
              <h3 className="text-base font-semibold text-ink-1">
                Source map
              </h3>
            </header>
            <ul className="flex flex-col">
              {decline.reasonIds.map((rid) => {
                const r = DECLINE_REASONS[rid];
                return (
                  <li
                    key={rid}
                    className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
                  >
                    <span className="text-sm text-ink-1">{r.label}</span>
                    <StatusBadge
                      kind={
                        r.source === "agent"
                          ? "info"
                          : r.source === "service"
                            ? "accent"
                            : "warning"
                      }
                    >
                      {r.source}
                    </StatusBadge>
                  </li>
                );
              })}
            </ul>
          </section>

          <StatCard
            label="Canvas SHA-256"
            value={`${SEED_CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · ${LIVE_DECLINES.length} live declines`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
