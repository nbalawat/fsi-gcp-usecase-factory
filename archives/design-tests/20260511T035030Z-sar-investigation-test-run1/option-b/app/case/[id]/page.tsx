import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  RegulatoryClock,
  StatCard,
  StatusBadge,
  WorkflowStageRail,
  type Metric,
  type NavItem,
  type Stage,
} from "@fsi-bank/components";
import { ClockSectionList } from "../../../components/ClockSectionList";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  REG_DEADLINE_AT,
  REG_DETECTED_AT,
  REG_REGIME,
  REG_WINDOW_DAYS,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  gateStates,
  getCase,
  stageBeats,
  toClockSections,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const RULE_LABEL: Record<string, string> = {
  structuring_signal_threshold: "Structuring signal",
  single_borrower_exposure: "Single-borrower exposure",
};

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

function summary(events: ReturnType<typeof getCase>["events"]): {
  totalEvents: number;
  agentCalls: number;
  serviceCalls: number;
} {
  let agentCalls = 0;
  let serviceCalls = 0;
  for (const e of events) {
    if (e.kind === "agent_invoked") agentCalls += 1;
    if (e.kind === "service_invoked") serviceCalls += 1;
  }
  return { totalEvents: events.length, agentCalls, serviceCalls };
}

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "This case", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

const STAGE_TYPE = {
  detected: "auto" as const,
  triage: "mixed" as const,
  investigation: "agent" as const,
  narrative_drafting: "agent" as const,
  officer_review: "human" as const,
  filed: "human" as const,
};

export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const sections = toClockSections(c.events, c.detected_at, c.reg_window_days);
  const gates = gateStates(c.events, c.hitl_gates, c.detected_at, c.reg_window_days);
  const beats = stageBeats(c.events, c.detected_at, c.reg_window_days);
  const sum = summary(c.events);

  // Mid-window simulated "now" — pinned via the `now` prop so SSR + tests
  // produce a deterministic clock. (The primitive otherwise live-ticks.)
  const NOW = new Date("2026-05-10T12:00:00.000Z");

  const stages: Stage[] = beats.map((b) => ({
    id: b.id,
    name: b.label,
    type: STAGE_TYPE[b.id as keyof typeof STAGE_TYPE] ?? "auto",
    count: 1,
    slo: undefined,
  }));

  const metrics: Metric[] = [
    {
      id: "regime",
      label: "Regulatory regime",
      value: "BSA SAR",
      tooltip: REG_REGIME,
    },
    {
      id: "window",
      label: "Window",
      value: `${c.reg_window_days} d`,
    },
    {
      id: "events",
      label: "Timeline events",
      value: sum.totalEvents,
    },
    {
      id: "agent",
      label: "Agent reasonings",
      value: sum.agentCalls,
    },
    {
      id: "service",
      label: "Service calls",
      value: sum.serviceCalls,
    },
  ];

  const approvalHref = `/approval/${c.id}`;

  return (
    <AppShell
      brand="SAR Investigations"
      subtitle="Regulatory-clock view"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="SAR Investigations"
        caseId={c.id}
        borrowerName={c.subject.name}
        backHref="/"
        backLabel="Live floor"
      />

      {/* HERO — the 30-day SAR clock is the page's spine. */}
      <section
        aria-label="Regulatory clock hero"
        className="border-b border-rule bg-paper px-6 py-6"
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[28rem_1fr]">
          {/* Left: the giant, live regulatory clock. */}
          <div>
            <RegulatoryClock
              startedAt={REG_DETECTED_AT}
              deadline={REG_DEADLINE_AT}
              regulatoryRegime="BSA SAR · 30 calendar days"
              now={NOW}
              amberAtHoursRemaining={120}
              redAtHoursRemaining={48}
            />
            <p className="mt-3 font-mono text-xs text-ink-3">
              The clock starts at first detection of the signal and runs for
              {" "}
              {c.reg_window_days} calendar days. Every section below is
              positioned on this axis by days remaining.
            </p>
          </div>

          {/* Right: case identity + verdicts + canvas pin. */}
          <div className="flex flex-col gap-3">
            <div>
              <div className="eyebrow">SAR case</div>
              <h1 className="font-serif text-3xl font-medium text-ink-1">
                {c.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
                <span>{c.id}</span>
                <span>·</span>
                <span>{c.subject.name}</span>
                <span>·</span>
                <span>{c.subject.type}</span>
                <span>·</span>
                <span>{c.subject.geo}</span>
                <span>·</span>
                <span>acct {c.subject.account}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
              <StatusBadge kind="warning">
                recommendation: {c.decision}
              </StatusBadge>
              <a
                href={approvalHref}
                className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:opacity-90"
              >
                Open SAR signoff →
              </a>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <StatCard
                label="Rule · structuring signal"
                value={RULE_VERDICTS.structuring_signal_threshold}
                unit="verdict"
                delta="14 cash deposits in 7 business days"
                tone="danger"
              />
              <StatCard
                label="Rule · single-borrower exposure"
                value={RULE_VERDICTS.single_borrower_exposure}
                unit="verdict"
                delta="exposure 1.8% of single-borrower cap"
                tone="ok"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Workflow stage rail — pinned under the hero. Each stage is
          annotated with when it began on the clock axis. */}
      <WorkflowStageRail stages={stages} currentStage={c.current_stage} />

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        {/* Main — the clock-anchored section list. */}
        <ClockSectionList sections={sections} approvalHref={approvalHref} />

        {/* Right rail — rule verdicts + canvas pin + gate ledger. */}
        <aside className="flex flex-col gap-4">
          <section
            aria-label="Rule verdicts"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">Rules engine</div>
              <h3 className="font-serif text-lg font-medium text-ink-1">
                Verdicts
              </h3>
            </header>
            <ul className="flex flex-col">
              {SHARED_RULES.map((r) => {
                const v = RULE_VERDICTS[r] ?? "skip";
                return (
                  <li
                    key={r}
                    className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
                  >
                    <span className="text-ui text-ink-1">
                      {RULE_LABEL[r] ?? r}
                    </span>
                    <StatusBadge kind={verdictBadge(v)}>{v}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            aria-label="HITL gate ledger"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">HITL gates</div>
              <h3 className="font-serif text-lg font-medium text-ink-1">
                Approvals
              </h3>
            </header>
            <ul className="flex flex-col">
              {gates.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
                >
                  <div className="flex flex-col">
                    <span className="text-ui text-ink-1">{g.label}</span>
                    {g.daysRemainingWhenPending !== undefined && (
                      <span className="font-mono text-xs text-ink-3 tabular-nums">
                        {g.daysRemainingWhenPending.toFixed(1)} d remaining when raised
                      </span>
                    )}
                  </div>
                  <a
                    href={`${approvalHref}?gate=${g.id}`}
                    className="rounded-sm border border-rule px-2 py-1 font-mono text-xs text-ink-2 hover:bg-paper-2"
                  >
                    open →
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta="hybrid model · BSA / AML"
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
