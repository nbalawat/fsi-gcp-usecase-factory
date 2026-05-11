import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatCard,
  type Metric,
  type NavItem,
} from "@primitives";
import { QueueBoard } from "../components/QueueBoard";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  RECOMMENDATIONS,
  USE_CASE_ID,
  queueKpis,
} from "../lib/data";

const NAV: NavItem[] = [
  { id: "queue", label: "Queue", icon: "inbox", href: "/" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "sent", label: "Sent", icon: "send" },
  { id: "archive", label: "Archive", icon: "archive" },
];

export default function HomePage(): React.ReactElement {
  const kpis = queueKpis(RECOMMENDATIONS);

  const metrics: Metric[] = [
    { id: "total", label: "In queue", value: kpis.total },
    {
      id: "pending",
      label: "Pending RM",
      value: kpis.pending,
      state: kpis.pending > 0 ? "warning" : "ok",
    },
    { id: "uplift", label: "Avg uplift", value: kpis.avgUplift, unit: "/100" },
    {
      id: "high",
      label: "High uplift",
      value: kpis.highUplift,
      state: kpis.highUplift > 0 ? "ok" : "ok",
    },
    {
      id: "review",
      label: "Reg review",
      value: kpis.regReview,
      state: kpis.regReview > 0 ? "warning" : "ok",
    },
  ];

  return (
    <AppShell
      brand="Next Best Action"
      subtitle="Recommendations console · inline disposition"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="queue"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="NBA Recommendations"
        backHref="/"
        backLabel="Queue"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">RM workbench</div>
            <h1 className="font-serif text-h1 font-semi text-ink-1">
              Today's queue
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-2">
              Disposition lives where the rationale is. Accept / Reject /
              Snooze / Escalate are inline on every card.{" "}
              <strong className="font-semi text-ink-1">
                Send to customer
              </strong>{" "}
              is the only action that walks to the irrevocable approval
              surface.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard
              label="Canvas"
              value={`${CANVAS_SHA256.substring(0, 8)}…`}
              unit="pinned"
              tone="neutral"
            />
            <StatCard
              label="Pending"
              value={kpis.pending}
              delta="awaiting RM disposition"
              tone={kpis.pending > 0 ? "warning" : "ok"}
            />
            <StatCard
              label="Avg uplift"
              value={`${kpis.avgUplift}`}
              unit="/100"
              spark={[
                kpis.avgUplift - 4,
                kpis.avgUplift - 2,
                kpis.avgUplift,
                kpis.avgUplift + 1,
                kpis.avgUplift + 3,
              ]}
              tone="ok"
            />
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <QueueBoard rows={RECOMMENDATIONS} />
    </AppShell>
  );
}
