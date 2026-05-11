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
import { DeclineStream } from "../../../components/DeclineStream";
import {
  LIVE_DECLINES,
  MODEL_PROVIDER,
  SEED_CANVAS_SHA256,
  USE_CASE_ID,
  getDecline,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "live", label: "Decline stream", icon: "radio", href: "/" },
  { id: "case", label: "This transaction", icon: "inbox", href: "/case/SAMPLE" },
  { id: "approval", label: "Bulk tuning", icon: "activity" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function ApprovalPage({ params }: PageProps): React.ReactElement {
  // For the bulk tuning surface we render the whole stream. The :id is
  // preserved in the URL so the breadcrumb / back-link stay meaningful
  // and a user landing from a per-case page sees that row at top.
  const focus = getDecline(params.id);

  // Pre-compute display KPIs from the stream — display-only counts, no
  // business decisions.
  const totalDeclines = LIVE_DECLINES.filter((d) => d.disposition === "decline").length;
  const totalStepUps = LIVE_DECLINES.filter((d) => d.disposition === "step-up").length;
  const totalHighScore = LIVE_DECLINES.filter((d) => d.score >= 0.8).length;
  const meanScore =
    LIVE_DECLINES.reduce((s, d) => s + d.score, 0) / Math.max(LIVE_DECLINES.length, 1);

  const metrics: Metric[] = [
    {
      id: "stream",
      label: "Decline stream",
      value: LIVE_DECLINES.length,
    },
    {
      id: "declines",
      label: "Outright declines",
      value: totalDeclines,
      state: "alert",
    },
    {
      id: "stepups",
      label: "Step-up routed",
      value: totalStepUps,
      state: "warning",
    },
    {
      id: "highscore",
      label: "High score (≥ 0.80)",
      value: totalHighScore,
    },
    {
      id: "mean",
      label: "Mean score",
      value: meanScore.toFixed(2),
    },
  ];

  return (
    <AppShell
      brand="Payment Fraud"
      subtitle="Bulk tuning surface"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Payment Fraud"
        caseId={focus.id}
        borrowerName={focus.customer}
        backHref={`/case/${focus.id}`}
        backLabel="Back to transaction"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
              Tune the model from the decline stream
            </div>
            <h1 className="font-serif text-2xl font-semibold text-ink-1">
              Every declined transaction is one click from override, allowlist, or tune
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-3">
              The fraud analyst&apos;s job is not to approve transactions; it
              is to tune the model from the decline feed. Each row below
              carries its own inline action buttons — disposition happens
              from the row, not from a hop to a side panel.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="info">
              focus: {focus.id}
            </StatusBadge>
            <a
              href={`/case/${focus.id}`}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              ← Open this transaction
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        <DeclineStream rows={LIVE_DECLINES} />

        <aside className="flex flex-col gap-4">
          <StatCard
            label="Approved analyst actions"
            value="override · allowlist · tune · step-up"
            tone="neutral"
            delta="Each action becomes one audit-trail row downstream"
          />
          <StatCard
            label="Canvas SHA-256"
            value={`${SEED_CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · 1 agent · 2 services`}
            tone="neutral"
          />
          <section
            aria-label="Action key"
            className="rounded-md border border-rule bg-paper px-4 py-3"
          >
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
              Action key
            </div>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm border border-accent bg-accent-tint" aria-hidden />
                <span className="text-ink-2">Override · customer-scoped allow</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm border border-semantic-info bg-semantic-infoTint" aria-hidden />
                <span className="text-ink-2">Allowlist · merchant-scoped allow</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm border border-semantic-warning bg-semantic-warningTint" aria-hidden />
                <span className="text-ink-2">Tune · adjust the threshold</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm border border-rule bg-paper-2" aria-hidden />
                <span className="text-ink-2">Step-up · route to 3DS</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
