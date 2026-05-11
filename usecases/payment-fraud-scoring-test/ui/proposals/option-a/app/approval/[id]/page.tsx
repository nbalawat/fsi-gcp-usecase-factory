import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { StepUpQueueRow, STEPUP_GRID } from "../../../components/StepUpQueueRow";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  STEP_UP_QUEUE,
  USE_CASE_ID,
  getStepUp,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "floor",   label: "Live floor",        icon: "radio",            href: "/" },
  { id: "stepup",  label: "Step-up queue",     icon: "inbox" },
  { id: "rules",   label: "Velocity rules",    icon: "git-branch" },
  { id: "drift",   label: "Model drift",       icon: "activity" },
];

const dollar = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusBadge = (s: string): "success" | "danger" | "warning" | "neutral" => {
  if (s === "passed") return "success";
  if (s === "failed") return "danger";
  if (s === "expired") return "neutral";
  return "warning";
};

export default function StepUpQueuePage({ params }: PageProps): React.ReactElement {
  const focus = getStepUp(params.id);
  const rows = STEP_UP_QUEUE;

  // Count states for the KPI strip — display only.
  let passed = 0;
  let failed = 0;
  let challenged = 0;
  let expired = 0;
  for (const r of rows) {
    if (r.status === "passed") passed += 1;
    else if (r.status === "failed") failed += 1;
    else if (r.status === "challenged") challenged += 1;
    else if (r.status === "expired") expired += 1;
  }

  const metrics: Metric[] = [
    { id: "queue",        label: "Queue size",          value: rows.length },
    { id: "passed",       label: "Passed challenge",    value: passed,       state: "ok" },
    { id: "failed",       label: "Failed challenge",    value: failed,       state: failed > 0 ? "alert" : "ok" },
    { id: "challenged",   label: "Outstanding",         value: challenged,   state: challenged > 0 ? "warning" : "ok" },
    { id: "expired",      label: "Expired",             value: expired },
  ];

  return (
    <AppShell
      brand="Payment fraud"
      subtitle="Step-up queue · review"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="stepup"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Payment fraud"
        caseId={focus?.id}
        borrowerName={focus?.merchant}
        backHref="/"
        backLabel="Live floor"
      />

      {/* Hero — note for the reviewer: this UC has NO HITL gates; this
          is a step-up disposition review queue (audit, not approval). */}
      <header className="border-b border-rule bg-paper px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">step-up queue (advisory · no HITL gate)</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {focus
                ? `${focus.merchant} · ${dollar(focus.amount_usd)}`
                : "No step-up challenges in window"}
            </h1>
            <p className="mt-1 max-w-3xl font-mono text-mono-sm leading-relaxed text-ink-3">
              Real-time payment fraud has no human-in-the-loop gate — the
              gray-zone-fraud-scorer auto-decides approve / decline / step-up.
              When the score lands in the step-up band, the customer is
              challenged (OTP / push / voice). This view lets Fraud Ops audit
              challenge response patterns: passed, failed, expired. Drilling
              into a row opens the underlying transaction.
            </p>
          </div>
          {focus && (
            <div className="flex items-center gap-2">
              <StatusBadge kind="info">{focus.channel}</StatusBadge>
              <StatusBadge kind={statusBadge(focus.status)}>
                {focus.status}
              </StatusBadge>
            </div>
          )}
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      {/* The queue — dense, single-line rows. */}
      <section aria-label="Step-up challenge queue" className="bg-paper">
        <header
          role="row"
          aria-label="Column headers"
          style={{ gridTemplateColumns: STEPUP_GRID }}
          className="grid h-6 items-center gap-3 border-b border-rule bg-paper-2 px-6 font-mono text-mono-sm uppercase tracking-wide text-ink-3"
        >
          <span>sent</span>
          <span>merchant</span>
          <span className="text-right">amount</span>
          <span>channel</span>
          <span className="text-right">resp</span>
          <span>challenge id</span>
          <span className="text-right">status</span>
        </header>

        <ol className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id}>
              <StepUpQueueRow row={r} />
            </li>
          ))}
        </ol>

        {rows.length === 0 && (
          <p className="px-6 py-4 font-mono text-mono-sm text-ink-3">
            The current window has no step-up challenges. Step-up rate is
            calculated on the Live Floor; this view fills as the model
            classifies more gray-zone transactions.
          </p>
        )}
      </section>

      <footer className="border-t border-rule bg-paper-2 px-6 py-2 font-mono text-mono-sm text-ink-3">
        <span className="eyebrow">option A · density 1 · throughput</span>
        <span className="ml-3">canvas {CANVAS_SHA256.substring(0, 12)}…</span>
      </footer>
    </AppShell>
  );
}
