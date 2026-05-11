import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  RegulatoryClock,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { ApprovalNarrativeClient } from "../../../components/ApprovalNarrativeClient";
import {
  HITL_GATES,
  MODEL_PROVIDER,
  USE_CASE_ID,
  gateStates,
  getCase,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

// Pre-shaped recommendation - no decision math in components.
const RECOMMENDATION: ApprovalRecommendation = {
  decision: "FILE_SAR",
  rationaleSummary:
    "complaint-categorizer (conf 0.91) classified the pattern as structuring + cross-border. peer-and-industry-context places the velocity-spike at 4.5 sigma against NAICS-33. insider-screener clears any Reg O exposure. Recommended disposition: file SAR.",
  approvalAuthority: "BSA Officer",
  irrevocable: true,
};

const NAV: NavItem[] = [
  { id: "queue",    label: "Investigation queue", icon: "layout-dashboard", href: "/" },
  { id: "case",     label: "Case detail",         icon: "inbox" },
  { id: "approval", label: "Approval flow",       icon: "activity" },
  { id: "agents",   label: "Agents",              icon: "bot" },
];

export default function ApprovalPage({ params }: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const gates = gateStates(c.events, c.hitl_gates);
  const gate =
    gates.find((g) => g.id === HITL_GATES[0]) ??
    gates[0] ??
    { id: "final_approval", label: "Final approval", status: "pending" as const };

  return (
    <AppShell
      brand="BSA / AML"
      subtitle="Approval - annotated narrative"
      context={`${USE_CASE_ID} - ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="SAR investigation"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref={`/case/${c.id}`}
        backLabel="Back to case"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Approval flow</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {c.title}
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-3">
              The approval surface IS the annotated narrative. Read each
              claim, click any [TXN] / [GEO] / [AGT] / [SVC] chip to drill
              into the underlying evidence, then sign off in the
              ApprovalGate at the bottom of the page.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
            <a
              href={`/case/${c.id}`}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              &lt;- Back to case
            </a>
          </div>
        </div>
      </header>

      <div className="border-b border-rule bg-paper-2 px-6 py-4">
        <RegulatoryClock
          startedAt={c.alertOpenedAt}
          deadline={c.sarDeadline}
          regulatoryRegime="FinCEN 30-day SAR filing window"
          amberAtHoursRemaining={120}
          redAtHoursRemaining={48}
        />
      </div>

      <div className="px-6 py-5">
        <ApprovalNarrativeClient
          caseId={c.id}
          gate={gate}
          recommendation={RECOMMENDATION}
        />
      </div>
    </AppShell>
  );
}
