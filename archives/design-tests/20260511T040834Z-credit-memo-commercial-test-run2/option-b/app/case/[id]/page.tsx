import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  PipelineMini,
  StatCard,
  StatusBadge,
  WorkflowStageRail,
  type Metric,
  type NavItem,
  type Stage,
} from "@fsi-bank/components";
import { StageHero } from "../../../components/StageHero";
import { StagePriorRail } from "../../../components/StagePriorRail";
import { StageFutureList } from "../../../components/StageFutureList";
import {
  CANVAS_SHA256,
  CASE_SHAPE,
  MODEL_PROVIDER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  bucketByStage,
  gateStates,
  getCase,
  paradigmSteps,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const RULE_LABEL: Record<string, string> = {
  dscr_threshold_by_industry: "DSCR threshold",
  leverage_threshold_by_industry: "Leverage threshold",
  single_borrower_exposure: "Single-borrower exposure",
  reg_o_individual_limit: "Reg O individual limit",
};

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "This case", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function CaseDetailPage({
  params,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const buckets = bucketByStage(c.events, CASE_SHAPE.stages, c.current_stage);
  const gates = gateStates(c.events, c.hitl_gates);
  const paradigm = paradigmSteps(c);

  const activeBucket =
    buckets.find((b) => b.status === "active") ??
    buckets[buckets.length - 1] ??
    buckets[0];
  const priorBuckets = buckets.filter(
    (b) => b.status === "done" && b.id !== activeBucket?.id,
  );
  const futureBuckets = buckets.filter((b) => b.status === "queued");

  // Feed the shared WorkflowStageRail — every stage becomes one cell.
  // `count` = events that fired in that bucket; that's the "throughput"
  // the rail expects. Pure shape transform — no business decisions.
  const railStages: Stage[] = buckets.map((b) => ({
    id: b.id,
    name: b.label,
    type: "mixed" as const,
    count: b.events.length,
  }));

  // Banker-readable metrics from the active bucket counts (no math).
  const activeEvents = activeBucket?.events ?? [];
  const metrics: Metric[] = [
    {
      id: "stage-events",
      label: "Active-stage events",
      value: activeEvents.length,
      tooltip: `Events in stage "${activeBucket?.label ?? "—"}"`,
    },
    {
      id: "stages-done",
      label: "Stages complete",
      value: `${priorBuckets.length + (activeBucket?.status === "done" ? 1 : 0)} / ${buckets.length}`,
    },
    {
      id: "gates-decided",
      label: "Gates decided",
      value: `${gates.filter((g) => g.status === "completed").length} / ${gates.length}`,
      state:
        gates.every((g) => g.status === "completed") ? "ok" : "warning",
    },
    {
      id: "current",
      label: "Current stage",
      value: activeBucket?.label ?? c.current_stage,
    },
    {
      id: "decision",
      label: "Decision",
      value: c.decision,
      state: c.decision === "approve" ? "ok" : "warning",
    },
  ];

  const approvalHref = `/approval/${c.id}`;

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Workflow-first console"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Commercial Credit"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref="/"
        backLabel="Live floor"
      />

      {/* Identity strip — small, because the SPINE is the page. */}
      <header className="border-b border-rule bg-paper px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Case</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {c.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{c.id}</span>
              <span>·</span>
              <span>{c.borrower.name}</span>
              <span>·</span>
              <span>{c.borrower.geo}</span>
              <span>·</span>
              <span>NAICS {c.borrower.naics}</span>
              <span>·</span>
              <span>band {c.borrower.risk_band}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
            <StatusBadge
              kind={c.decision === "approve" ? "success" : "neutral"}
            >
              {c.decision}
            </StatusBadge>
            <a
              href={approvalHref}
              className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:opacity-90"
            >
              Open approval flow
            </a>
          </div>
        </div>
      </header>

      {/* The SPINE — the workflow stage rail. The rail is the page's
          navigation: the user sees every stage at a glance, the current
          one is visually elevated by the shared primitive. */}
      <WorkflowStageRail
        stages={railStages}
        currentStage={activeBucket?.id}
      />

      <MetricStrip metrics={metrics} />

      {/* 3-column workflow layout — prior · hero · future. The hero
          occupies the centre column (~60% of viewport at lg+); prior
          stages compress left; future stages dim right. Column ratios
          1:3:1 use Tailwind's standard fr-track grammar — no arbitrary
          token values (Rule 1.6 of ui-standards.md). */}
      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <StagePriorRail
            buckets={priorBuckets}
            activeStageId={activeBucket?.id ?? c.current_stage}
          />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-3">
          {activeBucket && (
            <StageHero
              bucket={activeBucket}
              cta={
                <a
                  href={approvalHref}
                  className="rounded-sm border border-accent px-3 py-1 font-mono text-mono-sm text-accent-pressed hover:bg-accent-tint"
                >
                  Open approval flow
                </a>
              }
            />
          )}

          {/* Rules + gates strip — sits below the hero so it stays
              inside the workflow context, not relegated to a side panel. */}
          <section
            aria-label="Rule verdicts"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-4 py-3">
              <div className="eyebrow">Rules engine · this case</div>
              <h3 className="text-h4 font-semi text-ink-1">Verdicts</h3>
            </header>
            <ul className="grid grid-cols-1 gap-0 sm:grid-cols-2">
              {SHARED_RULES.map((r, i, arr) => {
                const v = RULE_VERDICTS[r] ?? "skip";
                const isLast = i === arr.length - 1;
                const isPenultimate = i === arr.length - 2;
                return (
                  <li
                    key={r}
                    className={[
                      "flex items-center justify-between gap-2 border-rule px-4 py-2.5",
                      isLast ? "" : "border-b",
                      isPenultimate ? "sm:border-b-0" : "",
                    ].join(" ")}
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
            aria-label="HITL gates"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-4 py-3">
              <div className="eyebrow">Human-in-the-loop</div>
              <h3 className="text-h4 font-semi text-ink-1">
                Approval gates
              </h3>
            </header>
            <ul className="flex flex-col">
              {gates.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2.5 last:border-b-0"
                >
                  <span className="text-ui text-ink-1">{g.label}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      kind={
                        g.status === "completed"
                          ? "success"
                          : g.status === "pending"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {g.status === "completed"
                        ? (g.decision ?? "decided")
                        : g.status}
                    </StatusBadge>
                    <a
                      href={`${approvalHref}?gate=${g.id}`}
                      className="rounded-sm border border-rule px-2 py-0.5 font-mono text-mono-sm text-accent-pressed hover:bg-accent-tint"
                    >
                      Open
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-1">
          <StageFutureList buckets={futureBuckets} />

          {/* 5-step paradigm anchor — surfaces the platform's shape so
              the workflow metaphor stays connected to the architecture. */}
          <PipelineMini steps={paradigm} contextId={c.id} />

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · full compliance`}
            tone="neutral"
          />
        </div>
      </div>
    </AppShell>
  );
}
