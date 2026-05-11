import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  type NavItem,
} from "@fsi-bank/components";
import { StageRail } from "../../../components/StageRail";
import { CurrentStageHero } from "../../../components/CurrentStageHero";
import { PipelineSpine } from "../../../components/PipelineSpine";
import { RulesVerdictBand } from "../../../components/RulesVerdictBand";
import {
  buildStageViews,
  CASE_SHAPE,
  LIVE_CASE,
  USE_CASE_ID,
  PRIMARY_BORROWER,
} from "../../../lib/data";

interface CasePageProps {
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
 * Case detail — workflow-first.
 *
 * Layout:
 *   ┌─ AppShell ────────────────────────────────────────────────┐
 *   │ ┌─ Breadcrumb ──────────────────────────────────────────┐ │
 *   │ │ Pipeline spine (the page backbone) ───────────────────│ │
 *   │ ├──────────┬────────────────────────────────────────────┤ │
 *   │ │ StageRail│ CurrentStageHero (60% viewport)            │ │
 *   │ │ (left)   │                                            │ │
 *   │ │          │ RulesVerdictBand                           │ │
 *   │ └──────────┴────────────────────────────────────────────┘ │
 */
export default function CasePage({ params }: CasePageProps) {
  // Read-only — no mutation, no math. params.id is rendered verbatim.
  const caseId = params.id ?? CASE_SHAPE.canonical_id;

  // For demo purposes we pin the hero to a meaningful stage: "drafting"
  // shows the user a stage with rich agent activity and a downstream gate
  // to navigate into. In production this would come from the live case
  // record. Falls back to LIVE_CASE.current_stage if "drafting" isn't in
  // the canvas, then to the first canvas stage if even that's missing.
  const fallbackStage =
    LIVE_CASE.current_stage ?? CASE_SHAPE.stages[0] ?? "intake";
  const heroStageId = CASE_SHAPE.stages.includes("drafting")
    ? "drafting"
    : fallbackStage;

  const stages = buildStageViews(heroStageId);
  const current = stages.find((s) => s.position === "current") ?? stages[0];
  if (!current) {
    // Defensive — canvas always has at least one stage, but a robust UI
    // never assumes. Render a minimal frame so we don't crash.
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
      active="cases"
      avatar="RM"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Commercial credit"
        stage={current.id}
        caseId={caseId}
        borrowerName={PRIMARY_BORROWER.name}
      />

      <PipelineSpine stages={stages} focusStageId={current.id} />

      <div className="grid min-h-[640px] grid-cols-[260px_1fr] gap-0">
        <StageRail stages={stages} caseId={caseId} mode="case" />

        <div className="flex flex-col gap-4 p-6">
          <CurrentStageHero
            stage={current}
            caseId={caseId}
            primaryActionHref={`/approval/${caseId}`}
            primaryActionLabel="Open approval flow"
          />

          <section
            aria-label="Rules verdicts band"
            className="flex flex-col gap-2"
          >
            <header className="flex items-baseline justify-between">
              <h2 className="text-h3 font-semi text-ink-1">Rules verdicts</h2>
              <a
                href={`/approval/${caseId}`}
                className="font-mono text-mono-sm text-accent hover:text-accent-pressed"
              >
                view in approval flow →
              </a>
            </header>
            <RulesVerdictBand />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
