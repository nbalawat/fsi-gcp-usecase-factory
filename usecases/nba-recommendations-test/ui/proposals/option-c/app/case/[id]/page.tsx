import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatCard,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@primitives";
import { InlineDispositionRow } from "../../../components/InlineDispositionRow";
import { TimelineList } from "../../../components/TimelineList";
import { GateRoster } from "../../../components/GateRoster";
import {
  CANVAS_SHA256,
  HITL_GATES,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  USE_CASE_ID,
  getRecommendation,
  toTimeline,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "queue", label: "Queue", icon: "inbox", href: "/" },
  { id: "this", label: "This case", icon: "layout-dashboard" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "sent", label: "Sent", icon: "send" },
];

export default function CaseDetailPage({
  params,
}: PageProps): React.ReactElement {
  const id = decodeURIComponent(params.id);
  const rec = getRecommendation(id);
  const timeline = toTimeline(PIPELINE_EVENTS);
  const approvalHref = `/approval/${encodeURIComponent(rec.id)}`;

  const metrics: Metric[] = [
    { id: "uplift", label: "Uplift score", value: rec.uplift_score, unit: "/100" },
    { id: "fit", label: "Fit score", value: rec.fit_score, unit: "/100" },
    {
      id: "reg",
      label: "Reg clear",
      value: rec.regulatory_clear,
      state: rec.regulatory_clear === "clear" ? "ok" : "warning",
    },
    { id: "stage", label: "Stage", value: rec.stage },
    { id: "events", label: "Timeline events", value: timeline.length },
  ];

  return (
    <AppShell
      brand="Next Best Action"
      subtitle="Recommendation detail"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="this"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="NBA Recommendations"
        caseId={rec.id}
        borrowerName={rec.borrower.name}
        backHref="/"
        backLabel="Queue"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Case</div>
            <h1 className="font-serif text-h1 font-semi text-ink-1">
              {rec.headline}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{rec.id}</span>
              <span>·</span>
              <span>{rec.borrower.name}</span>
              <span>·</span>
              <span>{rec.borrower.geo}</span>
              <span>·</span>
              <span>NAICS {rec.borrower.naics}</span>
              <span>·</span>
              <span>band {rec.borrower.risk_band}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="info">stage: {rec.stage}</StatusBadge>
            <StatusBadge
              kind={rec.regulatory_clear === "clear" ? "success" : "warning"}
            >
              reg {rec.regulatory_clear}
            </StatusBadge>
            <a
              href={approvalHref}
              className="rounded-sm bg-brandBlack px-3 py-1.5 font-mono text-mono-sm font-semi text-brandBlack-fg hover:bg-ink-2"
            >
              Open approval flow →
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        {/* Main column: the inline disposition card sits at the top — */}
        {/* same affordance as the queue, no walk required for the */}
        {/* reversible Accept/Reject/Snooze/Escalate actions. Below */}
        {/* the disposition is the audit timeline. */}
        <div className="flex flex-col gap-4">
          <InlineDispositionRow
            rec={rec}
            approvalHref={approvalHref}
            detailHref="#"
          />
          <TimelineList rows={timeline} />
        </div>

        <aside className="flex flex-col gap-4">
          <GateRoster gates={HITL_GATES} approvalHref={approvalHref} />
          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta="recommendations console · lightweight compliance"
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
