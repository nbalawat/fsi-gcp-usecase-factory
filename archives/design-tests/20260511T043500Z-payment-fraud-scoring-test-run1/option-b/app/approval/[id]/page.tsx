import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatCard,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { PolicyTuneClient } from "../../../components/PolicyTuneClient";
import {
  CANVAS_SHA256,
  DECISION_TALLY,
  HITL_GATES,
  MODEL,
  MODEL_PROVIDER,
  POLICY_THRESHOLDS,
  USE_CASE_ID,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { policy?: string };
}

// Pre-shaped recommendations per policy. These come from the canvas:
// real-time fraud is advisory, so the recommendations are framed as
// "this is the band the champion model occupies at the current
// threshold — review the daily impact before you tune". No decision
// math in this component or in the client.
const RECOMMENDATIONS: Record<string, ApprovalRecommendation> = {
  "VTM-5732": {
    decision: "ACCEPT",
    rationaleSummary:
      "MCC 5732 (electronics) has been the dominant gray-band contributor for the last 24h. Champion curve at the current 5 tx/24h threshold sits at 0.46 — comfortably inside the gray band. Drop only if false-positive rate on this MCC rises above 4%.",
    approvalAuthority: "ML Ops · Model Owner",
  },
  "VTM-5814": {
    decision: "ACCEPT",
    rationaleSummary:
      "MCC 5814 (food) is stable: 0.31 at the current 12 tx/24h threshold. No drift in the last week.",
    approvalAuthority: "ML Ops · Model Owner",
  },
  "VTM-6011": {
    decision: "ACCEPT",
    rationaleSummary:
      "MCC 6011 (ATM) is the highest-risk channel — current 3 tx/24h gives the most defensive curve (0.62). Tightening further may shrink auto-approve volume; loosening risks a measurable decline-rate uptick.",
    approvalAuthority: "ML Ops · Model Owner",
    irrevocable: true,
  },
  DBF: {
    decision: "ACCEPT",
    rationaleSummary:
      "Decline-band floor is the system-level safety net. Lowering risks auto-blocking legitimate traffic. The current 0.70 floor is anchored to the most recent champion-challenger evaluation.",
    approvalAuthority: "ML Ops · Model Owner",
    irrevocable: true,
  },
  ABC: {
    decision: "ACCEPT",
    rationaleSummary:
      "Approve-band ceiling sets the cut-off above which the agent is invoked. Raising shrinks agent load but risks under-routing borderline transactions.",
    approvalAuthority: "ML Ops · Model Owner",
  },
};

const NAV: NavItem[] = [
  { id: "model",   label: "Model health",  icon: "layout-dashboard", href: "/" },
  { id: "case",    label: "This sample",   icon: "inbox",            href: "/case/TX-26F4-001" },
  { id: "policy",  label: "Policy tuning", icon: "git-branch" },
  { id: "agents",  label: "Agents",        icon: "bot" },
];

export default function PolicyPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  // The route id is conceptual ("policy") — we surface every tunable
  // threshold and let the operator pick. If a specific policy was passed
  // via ?policy=… and it's valid, start on that one.
  const requested = searchParams?.policy;
  const requestedValid =
    requested && POLICY_THRESHOLDS.some((p) => p.id === requested)
      ? requested
      : undefined;
  const initialId = requestedValid ?? POLICY_THRESHOLDS[0]?.id ?? "VTM-5732";

  const metrics: Metric[] = [
    {
      id: "model",
      label: "Model",
      value: `${MODEL.name} ${MODEL.version}`,
    },
    {
      id: "policies",
      label: "Tunable policies",
      value: POLICY_THRESHOLDS.length,
    },
    {
      id: "hitl",
      label: "Per-tx HITL gates",
      value: HITL_GATES.length,
      tooltip:
        "Real-time fraud has no per-transaction HITL — humans tune policy, not cases.",
    },
    {
      id: "agent-share",
      label: "Agent share",
      value: `${DECISION_TALLY.agent_share_pct.toFixed(1)}%`,
    },
    {
      id: "p99",
      label: "p99 latency",
      value: DECISION_TALLY.p99_latency_ms,
      unit: "ms",
    },
  ];

  return (
    <AppShell
      brand="Fraud Scoring"
      subtitle="Policy tuning"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="policy"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Fraud Scoring"
        caseId={params.id}
        backHref="/"
        backLabel="Model health"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Policy tuning</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              Tune the model's bands and velocity thresholds
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-3">
              Real-time fraud is advisory: humans never approve individual
              transactions — they tune policy. Pick a threshold, read the
              daily impact at the current value, propose a change. The
              shared ApprovalGate primitive records the proposal for audit.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="info">advisory · no per-tx HITL</StatusBadge>
            <a
              href={`/case/TX-26F4-001`}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              ← Sample on the curve
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        <PolicyTuneClient
          policies={POLICY_THRESHOLDS}
          recommendations={RECOMMENDATIONS}
          initialId={initialId}
        />

        <aside className="flex flex-col gap-4">
          <section
            aria-label="Why no per-case HITL"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">SR 11-7 note</div>
              <h3 className="text-h4 font-semi text-ink-1">
                Advisory model · policy-level HITL only
              </h3>
            </header>
            <p className="px-3 py-3 text-body-sm text-ink-2">
              The gray-zone-fraud-scorer is an advisory model. It does
              not auto-execute decisions on individual transactions
              past the band assignment, and no human is in the loop on
              the per-transaction path (sub-second p99 leaves no room).
              The human-in-the-loop surface is THIS page: model owners
              tune velocity and band thresholds, the change flows
              through the rules service, and the audit trail is the
              record of every threshold change.
            </p>
          </section>

          <StatCard
            label="Auto-decline · day"
            value={DECISION_TALLY.auto_decline.toLocaleString()}
            unit="tx"
            delta={`baseline rate ${(DECISION_TALLY.decline_rate_baseline * 100).toFixed(2)}% · current ${(DECISION_TALLY.decline_rate_current * 100).toFixed(2)}%`}
            tone="warning"
          />

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · advisory`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
