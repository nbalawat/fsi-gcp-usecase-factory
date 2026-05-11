import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import { StageRail } from "../../../components/StageRail";
import { PipelineSpine } from "../../../components/PipelineSpine";
import { GateChain } from "../../../components/GateChain";
import { RulesVerdictBand } from "../../../components/RulesVerdictBand";
import {
  buildStageViews,
  CASE_SHAPE,
  LIVE_CASE,
  USE_CASE_ID,
  PRIMARY_BORROWER,
  HITL_GATES,
  gateDecision,
  relativeTime,
} from "../../../lib/data";

interface ApprovalPageProps {
  params: { id: string };
}

const nav: NavItem[] = [
  { id: "live", label: "Live floor", icon: "activity", href: "/" },
  {
    id: "cases",
    label: "Cases",
    icon: "inbox",
    href: `/case/${CASE_SHAPE.canonical_id}`,
    badge: 1,
  },
  {
    id: "approval",
    label: "Approval queue",
    icon: "git-branch",
    href: `/approval/${CASE_SHAPE.canonical_id}`,
    badge: 1,
  },
  { id: "agents", label: "Agents", icon: "bot", href: "/agents" },
  { id: "workflows", label: "Workflows", icon: "workflow", href: "/workflows" },
];

/**
 * Approval flow — workflow-first, gate-by-gate.
 *
 * Layout:
 *   ┌─ AppShell ──────────────────────────────────────────────┐
 *   │ Breadcrumb (… → approval)                               │
 *   │ Pipeline spine (the page backbone) ─────────────────────│
 *   ├──────────┬─────────────────────────────────────────────┤
 *   │ StageRail│ ApprovalHero (case summary + verdicts)       │
 *   │ (mode=   │ GateChain — 4 sequential HITL surfaces       │
 *   │ approval)│ ApprovalAudit (the trail)                    │
 *   └──────────┴─────────────────────────────────────────────┘
 */
export default function ApprovalPage({ params }: ApprovalPageProps) {
  const caseId = params.id ?? CASE_SHAPE.canonical_id;

  // The approval flow page pins the current-stage to "approval" so the
  // rail's hero anchor is the approval stage, and the future stages
  // collapse to "done".
  const fallbackStage =
    LIVE_CASE.current_stage ?? CASE_SHAPE.stages[0] ?? "intake";
  const heroStageId = CASE_SHAPE.stages.includes("approval")
    ? "approval"
    : fallbackStage;
  const stages = buildStageViews(heroStageId);
  const approvalStage =
    stages.find((s) => s.id === "approval") ??
    stages.find((s) => s.position === "current") ??
    stages[0];
  if (!approvalStage) {
    return (
      <main className="p-6 text-ink-2">No workflow stages configured.</main>
    );
  }

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Option B · workflow-first"
      context={`uc · ${USE_CASE_ID}`}
      nav={nav}
      active="approval"
      avatar="CO"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Commercial credit"
        stage="approval"
        caseId={caseId}
        borrowerName={PRIMARY_BORROWER.name}
      />

      <PipelineSpine stages={stages} focusStageId={approvalStage.id} />

      <div className="grid min-h-[640px] grid-cols-[260px_1fr] gap-0">
        <StageRail stages={stages} caseId={caseId} mode="approval" />

        <div className="flex flex-col gap-6 p-6">
          <ApprovalHero caseId={caseId} />

          <RulesVerdictBand />

          <GateChain caseId={caseId} />

          <ApprovalAudit />
        </div>
      </div>
    </AppShell>
  );
}

const ApprovalHero: React.FC<{ caseId: string }> = ({ caseId }) => {
  const remaining = HITL_GATES.filter((g) => !gateDecision(g)).length;
  return (
    <section
      aria-label="Approval summary"
      className="flex flex-col gap-3 rounded-lg border border-rule bg-paper p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
        <div>
          <div className="eyebrow">Approval flow · stage 8 of 9</div>
          <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
            {LIVE_CASE.title}
          </h1>
          <div className="mt-1 font-mono text-mono-sm text-ink-3">
            {caseId} · {PRIMARY_BORROWER.geo} · NAICS {PRIMARY_BORROWER.naics}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge
            kind={remaining === 0 ? "success" : "accent"}
          >
            {remaining === 0
              ? "all gates cleared"
              : `${remaining} gate${remaining === 1 ? "" : "s"} remain`}
          </StatusBadge>
          <a
            href={`/case/${caseId}`}
            className="font-mono text-mono-sm text-accent hover:text-accent-pressed"
          >
            ← back to case detail
          </a>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCell label="Borrower" value={PRIMARY_BORROWER.name} />
        <SummaryCell label="Risk band" value={PRIMARY_BORROWER.risk_band} />
        <SummaryCell label="Recommendation" value={LIVE_CASE.decision} />
        <SummaryCell
          label="Decision kind"
          value={LIVE_CASE.decision_kind}
        />
      </dl>
    </section>
  );
};

const SummaryCell: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="rounded-md border border-rule bg-paper-2 px-4 py-3">
    <div className="eyebrow">{label}</div>
    <div className="mt-1 text-ui font-medium text-ink-1 truncate">
      {value}
    </div>
  </div>
);

const ApprovalAudit: React.FC = () => {
  // Each gate decision rendered as an audit row — read-only summary of
  // human_action events in PIPELINE_EVENTS. No mutation, no business logic.
  return (
    <section
      aria-label="Audit trail"
      className="flex flex-col gap-2 rounded-md border border-rule bg-paper p-4"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="text-h4 font-semi text-ink-1">Audit trail</h3>
        <span className="font-mono text-mono-sm text-ink-3">
          {HITL_GATES.length} gate events
        </span>
      </header>
      <ol className="flex flex-col">
        {HITL_GATES.map((gate) => {
          const decision = gateDecision(gate);
          return (
            <li
              key={gate}
              className="flex items-center gap-3 border-b border-rule py-2 last:border-b-0"
            >
              <span
                aria-hidden
                className={`h-2 w-2 flex-shrink-0 rounded-full ${
                  decision ? "bg-semantic-success" : "bg-ink-4"
                }`}
              />
              <span className="text-ui font-medium text-ink-1 min-w-[10rem]">
                {gate}
              </span>
              <span className="flex-1 font-mono text-mono-sm text-ink-3 truncate">
                {decision
                  ? `${decision.decision} · ${relativeTime(decision.at)}`
                  : "pending"}
              </span>
              <StatusBadge kind={decision ? "success" : "neutral"}>
                {decision ? decision.decision : "queued"}
              </StatusBadge>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
