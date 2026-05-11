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
import { EventForensicCard } from "../../../components/EventForensicCard";
import { DecisionStreamRail } from "../../../components/DecisionStreamRail";
import {
  CANVAS_CHECKSUM_PINNED,
  MODEL_PROVIDER,
  USE_CASE_ID,
  buildFiringStream,
  decisionBadge,
  getEvent,
  labelOfFeature,
  labelOfMcc,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "heatmap", label: "Heatmap floor", icon: "layout-dashboard", href: "/" },
  { id: "event",   label: "This event",   icon: "inbox" },
  { id: "rules",   label: "Rules",        icon: "git-branch" },
  { id: "agent",   label: "Agent",        icon: "bot" },
];

export default function EventPage({ params }: PageProps): React.ReactElement {
  const stream = buildFiringStream();
  const event = getEvent(params.id);

  if (!event) {
    return (
      <AppShell
        brand="Payment fraud scoring"
        subtitle="Event drill-in"
        context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
        nav={NAV}
        active="event"
      >
        <BreadcrumbNav
          usecase={USE_CASE_ID}
          usecaseLabel="Payment fraud scoring"
          caseId={params.id}
          backHref="/"
          backLabel="Heatmap floor"
        />
        <section className="mx-6 my-8 rounded-md border border-rule bg-paper p-6">
          <div className="eyebrow">Not found</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink-1">
            No event {params.id}
          </h1>
          <p className="mt-2 text-sm text-ink-3">
            The id was not present in the live firing window. The event
            may have aged out of the buffer.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-sm border border-rule px-3 py-1.5 font-mono text-xs text-ink-1 hover:bg-paper-2"
          >
            ← Back to heatmap floor
          </a>
        </section>
      </AppShell>
    );
  }

  // Per-event metrics — every value comes from the event record
  // verbatim. No ratios computed, no thresholds applied.
  const metrics: Metric[] = [
    {
      id: "amount",
      label: "Amount (USD)",
      value: event.amountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 }),
    },
    {
      id: "score",
      label: "Score",
      value: event.score,
      state:
        event.score >= 70 ? "danger" : event.score >= 40 ? "warning" : "ok",
    },
    {
      id: "conf",
      label: "Model confidence",
      value: `${Math.round(event.modelConfidence * 100)}%`,
    },
    {
      id: "decision",
      label: "Decision",
      value: event.decision,
      state:
        event.decision === "decline"
          ? "danger"
          : event.decision === "step-up"
            ? "warning"
            : "ok",
    },
    {
      id: "features",
      label: "Features firing",
      value: event.features.length,
    },
  ];

  return (
    <AppShell
      brand="Payment fraud scoring"
      subtitle="Event drill-in"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="event"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Payment fraud scoring"
        caseId={event.id}
        borrowerName={event.merchant}
        backHref="/"
        backLabel="Heatmap floor"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Event drill-in</div>
            <h1 className="font-serif text-3xl font-semibold text-ink-1">
              {event.merchant}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-3">
              The forensic view of a single firing. Every contributing
              feature links back to its cell on the heatmap, so the
              reader can see this event in the context of the
              population.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind={decisionBadge(event.decision)}>
              {event.decision}
            </StatusBadge>
            <a
              href="/"
              className="rounded-sm border border-rule px-3 py-1 font-mono text-xs text-ink-2 hover:bg-paper-2"
            >
              ← Heatmap floor
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        <EventForensicCard event={event} />

        <aside className="flex flex-col gap-4">
          <DecisionStreamRail
            events={stream}
            limit={10}
            buildHref={(id) => `/event/${id}`}
          />

          <section
            aria-label="Cell membership"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">Cell membership</div>
              <h3 className="font-serif text-lg font-semibold text-ink-1">
                Heatmap cells lit
              </h3>
            </header>
            {event.features.length === 0 ? (
              <p className="px-3 py-3 text-xs text-ink-3">
                None — this event contributed no non-approve features.
              </p>
            ) : (
              <ul className="flex flex-col">
                {event.features.map((fid) => (
                  <li
                    key={fid}
                    className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
                  >
                    <span className="font-mono text-xs text-ink-1 truncate">
                      {labelOfFeature(fid)}{" "}
                      <span className="text-ink-3">×</span>{" "}
                      {labelOfMcc(event.mcc)}
                    </span>
                    <a
                      href={`/?cell=${fid}::${event.mcc}`}
                      className="font-mono text-xs text-accent-pressed hover:underline"
                    >
                      Cell →
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_CHECKSUM_PINNED.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · ${USE_CASE_ID}`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
