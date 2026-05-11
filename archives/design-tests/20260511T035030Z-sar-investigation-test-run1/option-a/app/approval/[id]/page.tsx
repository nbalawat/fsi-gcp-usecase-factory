import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  RegulatoryClock,
  StatusBadge,
  type ApprovalRecommendation,
  type NavItem,
} from "@fsi-bank/components";
import { ApprovalGateClient } from "../../../components/ApprovalGateClient";
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
  searchParams?: { action?: string };
}

const NAV: NavItem[] = [
  { id: "queue", label: "Queue", icon: "inbox", href: "/" },
  { id: "case", label: "Case detail", icon: "activity" },
  { id: "approval", label: "Approval gate", icon: "git-branch" },
  { id: "agents", label: "Agents", icon: "bot" },
];

// SAR-specific banker-facing recommendation copy. Mirrors the
// regulatory-narrator's draft output (the canvas's last agent).
const SAR_RECOMMENDATION: ApprovalRecommendation = {
  decision: "FILE SAR",
  rationaleSummary:
    "Structuring signal threshold breached on day 9 of the velocity window. Borrower-network, exposure-aggregator, and peer-and-industry-context all corroborate. Single-borrower exposure and insider aggregate limits PASS; Reg O individual limit on WATCH (not blocking). Recommend filing under FinCEN Section 5 within the 30-day window.",
  approvalAuthority: "BSA Officer",
  irrevocable: true,
};

function validPrefill(
  s: string | undefined,
): "file_sar" | "dismiss" | "escalate" | undefined {
  if (s === "file_sar" || s === "dismiss" || s === "escalate") return s;
  return undefined;
}

export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const reason = pickAlertReason(c);
  const sum = summarizeCase(c);
  const gates = gateStates(c.events, c.hitl_gates);
  const activity = activityFeed(c);
  const agentTotal = Object.keys(AGENT_OUTPUT_STUBS).length;
  const prefill = validPrefill(searchParams?.action);

  return (
    <AppShell
      brand="SAR Investigations"
      subtitle="Approval gate"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="SAR Investigations"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref={`/case/${c.id}`}
        backLabel="Back to case"
      />

      {/* Compact hero — recommendation + clock side by side. The clock
          appears in BOTH places (case + approval) because the deadline
          is the dominant constraint of the entire workflow. */}
      <header className="border-b border-rule bg-paper px-8 py-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
                approval gate · final signoff
              </span>
              <StatusBadge kind="danger">FILE SAR</StatusBadge>
            </div>
            <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight text-ink-1">
              {reason.headline}
            </h1>
            <p className="mt-2 font-mono text-sm text-ink-3">
              {c.id} · {c.borrower.name} · {c.borrower.geo} · NAICS {c.borrower.naics}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <RegulatoryClock
              startedAt={c.alertedAt}
              deadline={c.sarDeadline}
              regulatoryRegime="FinCEN 30-day SAR"
              redAtHoursRemaining={120}
              amberAtHoursRemaining={240}
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6 px-8 py-8">
          {/* The single approval gate — file / dismiss / escalate. */}
          <ApprovalGateClient
            caseId={c.id}
            recommendation={SAR_RECOMMENDATION}
            prefill={prefill}
          />

          {/* Evidence — collapsed into a deliberately short list of
              named agents and services. Sparse-executive: name the
              source, link out — don't reproduce the chain. */}
          <section
            id="evidence"
            aria-label="Evidence chain"
            className="flex flex-col gap-3 rounded-sm border border-rule bg-paper p-6"
          >
            <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
              evidence chain
            </span>
            <p className="text-sm text-ink-2">
              {sum.agentCalls} agent reasonings and {sum.serviceCalls} service
              calls produced this recommendation. The complete event log
              and per-event citations are accessible from each named
              source below.
            </p>
            <ul className="flex flex-col gap-1.5">
              {activity.map((a) => (
                <li
                  key={`${a.kind}-${a.ref}`}
                  className="flex items-baseline justify-between gap-3 border-b border-rule pb-1.5 last:border-b-0 last:pb-0"
                >
                  <span className="font-mono text-sm">
                    <span className="text-ink-3">{a.kind}</span>{" "}
                    <span className="text-ink-1">{a.label}</span>
                  </span>
                  <span className="font-mono text-xs text-ink-3">
                    {new Date(a.at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

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
