import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatCard,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { AuditLedger } from "../../../components/AuditLedger";
import { ExamHeader } from "../../../components/ExamHeader";
import { GateRoster } from "../../../components/GateRoster";
import { ThresholdLedger } from "../../../components/ThresholdLedger";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  USE_CASE_ID,
  gateStates,
  getCase,
  summarize,
  thresholdRows,
  toLedger,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "exam", label: "Exam workbench", icon: "layout-dashboard", href: "/" },
  { id: "facility", label: "Facility", icon: "inbox" },
  { id: "booking", label: "Reserve booking", icon: "activity" },
  { id: "rules", label: "Threshold ledger", icon: "git-branch" },
];

/**
 * Facility detail — the OCC examiner's view of one facility.
 *
 *   1. Exam cover page (facility identity, recommendation).
 *   2. Metrics strip — counters only, no derived business judgments.
 *   3. Threshold ledger — every rule with its citation chain.
 *   4. Supervisory exam log — every event with its citation chain.
 *   5. Reviewer gates + canvas anchor.
 */
export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const sum = summarize(c);
  const ledger = toLedger(c.events);
  const thresholds = thresholdRows();
  const gates = gateStates(c.events, c.hitl_gates);

  const metrics: Metric[] = [
    {
      id: "thresholds",
      label: "Thresholds evaluated",
      value: sum.thresholdsEvaluated,
    },
    {
      id: "breaches",
      label: "Watch / breach",
      value: sum.thresholdsBreached,
      state: sum.thresholdsBreached > 0 ? "warning" : "ok",
    },
    {
      id: "agents",
      label: "Agent reasonings",
      value: sum.agentCalls,
    },
    {
      id: "services",
      label: "Service calls",
      value: sum.serviceCalls,
    },
    {
      id: "citations",
      label: "Citations cited",
      value: sum.citationsCovered,
    },
  ];

  const approvalHref = `/approval/${c.id}`;

  return (
    <AppShell
      brand="CRE Surveillance"
      subtitle="Facility examination"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="facility"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CRE Surveillance"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref="/"
        backLabel="Exam workbench"
      />

      <ExamHeader
        c={c}
        subtitle={
          "Facility audit report. Every entry below carries its citation chain — " +
          "an examiner can read this page top-to-bottom and prove every action."
        }
        actionLabel="Open reserve booking"
        actionHref={approvalHref}
        runId={`${USE_CASE_ID}-2026Q2`}
      />

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-3">
        {/* Main column — the audit ledger is the page. */}
        <div className="lg:col-span-2">
          <AuditLedger rows={ledger} />
        </div>

        {/* Right rail — gate roster, threshold summary, canvas anchor. */}
        <aside className="flex flex-col gap-4">
          <GateRoster
            gates={gates}
            buildHref={(g) => `${approvalHref}?gate=${g}`}
          />

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta="auditor-ready · regulator-audit-first"
            tone="neutral"
          />

          <div className="rounded-md border border-rule bg-paper">
            <header className="border-b border-rule px-4 py-3">
              <div className="eyebrow">Compliance scope</div>
              <h3 className="font-serif text-h3 font-semi text-ink-1">
                What this run covers
              </h3>
            </header>
            <ul className="flex flex-col text-body-sm text-ink-2">
              <li className="border-b border-rule px-4 py-2.5">
                Concentration risk · OCC Bulletin 2006-46
              </li>
              <li className="border-b border-rule px-4 py-2.5">
                ALLL methodology · OCC Bulletin 2020-49 (CECL)
              </li>
              <li className="border-b border-rule px-4 py-2.5">
                Real-estate lending · 12 CFR 34 Subpart D
              </li>
              <li className="px-4 py-2.5">
                Bank policy · BANK-CRE-POL-2026 §4, §6
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <section className="px-6 pb-6">
        <ThresholdLedger rows={thresholds} />
      </section>
    </AppShell>
  );
}
