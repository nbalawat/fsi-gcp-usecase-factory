import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  RegulatoryClock,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { SarFilingClient } from "../../../components/SarFilingClient";
import {
  HITL_GATES,
  MODEL_PROVIDER,
  USE_CASE_ID,
  gateStates,
  getCase,
  sarClockWindow,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { gate?: string };
}

// Pre-shaped recommendation per gate. The auditor doesn't allow
// decision math in components, so the recommendation is built here as
// fixed canvas copy.
const RECOMMENDATIONS: Record<string, ApprovalRecommendation> = {
  final_approval: {
    decision: "APPROVE",
    rationaleSummary:
      "Sub-graph shows velocity-spike wire-out aggregation across 14 days with structuring signal flagged by exposure-aggregator. Regulatory-narrator and insider-screener concur. Sub-graph and narrative are filing-ready.",
    approvalAuthority: "BSA Officer",
    irrevocable: true,
  },
};

const NAV: NavItem[] = [
  { id: "live", label: "Alert queue", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "Case graph", icon: "inbox" },
  { id: "approval", label: "SAR filing", icon: "activity" },
  { id: "agents", label: "Agents", icon: "bot" },
];

export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const gates = gateStates(c.events, c.hitl_gates);
  const clockWindow = sarClockWindow(c.events);

  // SAR has a single HITL gate (final_approval). Pick from query param
  // if explicitly provided, else first pending, else first.
  const requested = searchParams?.gate;
  const requestedValid =
    requested && HITL_GATES.includes(requested) ? requested : undefined;
  const firstPending = gates.find((g) => g.status === "pending")?.id;
  const activeGateId =
    requestedValid ?? firstPending ?? gates[0]?.id ?? HITL_GATES[0] ?? "final_approval";
  const activeGate = gates.find((g) => g.id === activeGateId) ?? gates[0];

  if (!activeGate) {
    return (
      <AppShell
        brand="BSA/AML"
        subtitle="SAR filing"
        context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
        nav={NAV}
        active="approval"
      >
        <p className="px-6 py-10 text-ink-3">
          No HITL gates configured for this case.
        </p>
      </AppShell>
    );
  }

  const rec = RECOMMENDATIONS[activeGate.id] ?? {
    decision: "RETURN_FOR_REVISION",
    rationaleSummary:
      "Recommendation not yet generated for this gate.",
  };

  return (
    <AppShell
      brand="BSA/AML"
      subtitle="SAR filing"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="BSA/AML SAR"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref={`/case/${c.id}`}
        backLabel="Back to case graph"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">SAR filing</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {c.title}
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-3">
              The filing scope is the selected sub-graph. Toggle edges to
              refine; the narrative regenerates from the selection. Sign
              off below to file the SAR — this is the only irrevocable
              action.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
            <StatusBadge
              kind={
                activeGate.status === "completed"
                  ? "success"
                  : activeGate.status === "pending"
                    ? "warning"
                    : "neutral"
              }
            >
              {activeGate.label}: {activeGate.decision ?? activeGate.status}
            </StatusBadge>
            <a
              href={`/case/${c.id}`}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              ← Full case graph
            </a>
          </div>
        </div>
      </header>

      {/* Regulatory clock stays in view during the filing decision. */}
      <section className="border-b border-rule bg-paper-2 px-6 py-4">
        <div className="max-w-md">
          <RegulatoryClock
            startedAt={clockWindow.startedAt}
            deadline={clockWindow.deadline}
            regulatoryRegime={clockWindow.regulatoryRegime}
          />
        </div>
      </section>

      <div className="px-6 py-5">
        <SarFilingClient
          caseId={c.id}
          borrowerName={c.borrower.name}
          events={c.events}
          gate={activeGate}
          recommendation={rec}
        />
      </div>
    </AppShell>
  );
}
