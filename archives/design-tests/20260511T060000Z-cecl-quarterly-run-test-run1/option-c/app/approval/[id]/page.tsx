import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  RegulatoryClock,
  StatCard,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import { CfoAttestClient } from "../../../components/CfoAttestClient";
import { AuditLedger } from "../../../components/AuditLedger";
import {
  AUDITOR_CANVAS_SHA256,
  BORROWERS,
  MODEL_PROVIDER,
  USE_CASE_ID,
  getRun,
  gateStates,
  methodologyOwnerStats,
  runTotals,
  runWindow,
  toAuditRows,
  toSegmentRows,
  fmtCurrency,
  fmtPctBps,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "live", label: "Run overview", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "Run detail", icon: "workflow" },
  { id: "approval", label: "CFO attest", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

/**
 * The CFO attestation surface — the ONE action that escapes inline.
 * Single-column read: the CFO sees what they are attesting to, signs off,
 * and the gate is closed. Irrevocable; the canvas hitl_gates contract
 * mandates this gate is the regulator-visible one.
 *
 * Note: NO segment-row affordances here. Reversible segment-methodology
 * approvals all happen on the run-overview / run-detail. By the time the
 * user reaches /approval they have already approved each segment row;
 * this page rolls them up.
 */
export default function CfoAttestPage({
  params,
}: PageProps): React.ReactElement {
  const c = getRun(params.id);
  const segments = toSegmentRows(BORROWERS);
  const totals = runTotals(segments);
  const ownerStats = methodologyOwnerStats(segments);
  const gates = gateStates(c.events, c.hitl_gates);
  const window = runWindow(c.events);
  const auditRows = toAuditRows(c.events);

  const cfoGate = gates.find((g) => g.name === "cfo_attest_run");
  const segmentGate = gates.find(
    (g) => g.name === "approve_segment_methodology",
  );

  // Defensive fallbacks — canvas schema drift may remove a gate.
  if (!cfoGate || !segmentGate) {
    return (
      <AppShell
        brand="CECL Q2 close"
        subtitle="CFO attestation"
        context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
        nav={NAV}
        active="approval"
      >
        <main className="mx-auto max-w-2xl p-10">
          <h1 className="font-serif text-h1 text-ink-1">Gate not in scope</h1>
          <p className="mt-3 text-ink-2">
            The current canvas does not declare both the segment-methodology
            and CFO-attest gates. Return to the{" "}
            <a className="underline" href="/">
              run overview
            </a>
            .
          </p>
        </main>
      </AppShell>
    );
  }

  const methodologyOwners = ownerStats.map((o) => o.owner.split(",")[0]);

  return (
    <AppShell
      brand="CECL Q2 close"
      subtitle="CFO attestation"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CECL quarterly run"
        stage="cfo-attest"
        caseId={c.id}
        backHref="/"
        backLabel="Run overview"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Irrevocable HITL gate</div>
            <h1 className="font-serif text-h1 font-semi text-ink-1">
              CFO attest · {c.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{c.id}</span>
              <span>·</span>
              <span>actor: {c.primary_actor}</span>
              <span>·</span>
              <span>regulator-visible</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge
              kind={
                segmentGate.status === "completed"
                  ? "success"
                  : segmentGate.status === "pending"
                    ? "warning"
                    : "neutral"
              }
            >
              segment-methodology: {segmentGate.status}
            </StatusBadge>
            <StatusBadge
              kind={
                cfoGate.status === "completed"
                  ? "success"
                  : cfoGate.status === "pending"
                    ? "warning"
                    : "neutral"
              }
            >
              cfo-attest: {cfoGate.status}
            </StatusBadge>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_360px]">
        <main className="px-6 py-6">
          <CfoAttestClient
            caseId={c.id}
            totalAllowanceLabel={fmtCurrency(totals.totalEcl)}
            segmentCount={totals.segmentCount}
            weightedPdLabel={fmtPctBps(totals.weightedPdBps)}
            methodologyOwners={methodologyOwners}
            cfoGate={cfoGate}
            segmentMethodologyGate={segmentGate}
          />
        </main>

        <aside className="flex flex-col gap-4 border-t border-rule bg-paper-2 p-5 lg:border-l lg:border-t-0">
          <RegulatoryClock
            startedAt={window.startedAt}
            deadline={window.deadline}
            regulatoryRegime={window.regulatoryRegime}
            amberAtHoursRemaining={72}
            redAtHoursRemaining={24}
          />

          <StatCard
            label="Proposed allowance"
            value={fmtCurrency(totals.totalEcl)}
            unit="Q2"
            delta={`${totals.segmentCount} segments · weighted PD ${fmtPctBps(totals.weightedPdBps)}`}
            tone="neutral"
          />

          <StatCard
            label="Canvas pin"
            value={`${AUDITOR_CANVAS_SHA256.substring(0, 8)}…`}
            unit="SHA"
            delta={`${gates.length} HITL gate${gates.length === 1 ? "" : "s"} · ${MODEL_PROVIDER}`}
            tone="neutral"
          />

          <a
            href="/"
            className="rounded-sm border border-rule bg-paper px-4 py-2 text-center font-mono text-mono-sm text-ink-1 hover:bg-paper-2"
          >
            ← Cancel and return
          </a>
        </aside>
      </div>

      <section className="border-t border-rule bg-paper-2 px-6 py-5">
        <AuditLedger rows={auditRows} />
      </section>
    </AppShell>
  );
}
