import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  RegulatoryClock,
  type NavItem,
} from "@fsi-bank/components";
import { DecisionHero } from "../../../components/DecisionHero";
import { RightRail } from "../../../components/RightRail";
import {
  AGENT_OUTPUT_STUBS,
  CANVAS_SHA256,
  MODEL_PROVIDER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  activityFeed,
  gateStates,
  getCase,
  pickAlertReason,
  summarizeCase,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "queue", label: "Queue", icon: "inbox", href: "/" },
  { id: "case", label: "This case", icon: "activity" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function CaseDetailPage({
  params,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const reason = pickAlertReason(c);
  const sum = summarizeCase(c);
  const gates = gateStates(c.events, c.hitl_gates);
  const activity = activityFeed(c);
  const agentTotal = Object.keys(AGENT_OUTPUT_STUBS).length;

  const approvalHref = `/approval/${c.id}`;

  return (
    <AppShell
      brand="SAR Investigations"
      subtitle="Sparse executive view"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="SAR Investigations"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref="/"
        backLabel="Queue"
      />

      {/* The decision IS the page — biggest type, banker vocabulary. */}
      <DecisionHero
        caseId={c.id}
        borrowerName={c.borrower.name}
        geo={c.borrower.geo}
        naics={c.borrower.naics}
        title={c.title}
        decision={c.decision}
        reasonHeadline={reason.headline}
        approvalHref={approvalHref}
      />

      {/* Body: clock + the one reason on the left; tiny rail on the right. */}
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6 px-8 py-8">
          {/* The 30-day SAR clock — the second-most-important thing. */}
          <section
            aria-label="SAR filing clock"
            className="flex flex-col gap-3"
          >
            <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
              regulatory clock
            </span>
            <RegulatoryClock
              startedAt={c.alertedAt}
              deadline={c.sarDeadline}
              regulatoryRegime="FinCEN 30-day SAR filing"
              redAtHoursRemaining={120}
              amberAtHoursRemaining={240}
            />
            <p className="text-sm text-ink-3">
              The SAR must be filed within 30 calendar days of the alert.
              The clock turns amber at 10 days remaining and red at 5
              days. After 30 days the case is reported as breached and
              escalation is automatic.
            </p>
          </section>

          {/* The ONE reason — full prose, but capped. */}
          <section
            aria-label="Alert reason"
            className="flex flex-col gap-3 rounded-sm border border-rule bg-paper-2 p-6"
          >
            <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
              why this case is here · {reason.attribution}
            </span>
            <p className="font-serif text-2xl leading-snug text-ink-1">
              {reason.headline}
            </p>
            <p className="text-base text-ink-2">{reason.detail}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <a
                href={`${approvalHref}#evidence`}
                className="rounded-sm border border-rule bg-paper px-3 py-1.5 font-mono text-xs text-ink-2 hover:bg-paper-3"
              >
                See evidence chain ({sum.agentCalls} agents · {sum.serviceCalls} services)
              </a>
            </div>
          </section>

          {/* Everything else (terms, exposure, peer context, narrative draft)
              is hidden one click deep. Sparse-executive: respect the
              officer's time. */}
          <section
            aria-label="Hidden detail"
            className="flex flex-col gap-2 rounded-sm border border-dashed border-rule p-4"
          >
            <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
              compressed below the fold
            </span>
            <p className="text-sm text-ink-3">
              Borrower network, exposure aggregation, peer-and-industry
              context, draft narrative, and the full event log are one
              click away from the approval gate. The queue scanner does
              not need them to triage.
            </p>
          </section>
        </div>

        {/* Tiny right rail — gates, rules, activity, canvas pin. */}
        <RightRail
          gates={gates}
          activity={activity}
          ruleVerdicts={RULE_VERDICTS}
          ruleOrder={SHARED_RULES}
          totalEvents={sum.totalEvents}
          agentCalls={sum.agentCalls}
          agentTotal={agentTotal}
          canvasShaShort={CANVAS_SHA256.substring(0, 8)}
        />
      </div>
    </AppShell>
  );
}
