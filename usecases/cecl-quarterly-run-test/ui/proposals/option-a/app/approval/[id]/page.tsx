import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  BreadcrumbNav,
  RegulatoryClock,
  StatusBadge,
  StepProgress,
  type ApprovalRecommendation,
  type NavItem,
} from "@fsi-bank/components";
import { AttestRespondClient } from "../../../components/AttestRespondClient";
import { SegmentLedger } from "../../../components/SegmentLedger";
import {
  USE_CASE_ID,
  MODEL_PROVIDER,
  buildLedger,
  buildRail,
  fmtUsdM,
  gateStates,
  getRun,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "runs", label: "Runs", icon: "layout-dashboard", href: "/" },
  { id: "attest", label: "Attestation", icon: "inbox" },
  { id: "models", label: "Models", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

/**
 * CFO attestation surface — the HITL flow.
 *
 * Sparse density discipline still holds: one big number (the
 * allowance the CFO is asked to sign), one regulatory clock, the
 * exception ledger inline (so the CFO sees what was overridden
 * before approving), and the ApprovalGate primitive at the bottom.
 */
export default function ApprovalPage({ params }: PageProps): React.ReactElement {
  const run = getRun(params.id);
  const stages = buildRail(run.events);
  const ledger = buildLedger(run.borrowers);
  const gates = gateStates(run.events, run.hitl_gates);
  const exceptionsLedger = ledger.filter((r) => r.exception);

  const cfoGate = gates.find((g) => g.id === "final_approval");

  const recommendation: ApprovalRecommendation = {
    decision: "APPROVE",
    riskBand: "1-pass",
    rationaleSummary: `Allowance of ${fmtUsdM(run.totalAllowance_usd_m)} across ${ledger.length} segments. ${run.exceptionCount} exceptions reviewed and overlaid (+15 bps each) by Credit Risk Officer. All ${run.hitl_gates.length} HITL gates ${cfoGate?.status === "completed" ? "completed" : "in progress"}. Provider: ${MODEL_PROVIDER}. Posting will hit GL and update SEC 10-Q draft.`,
    approvalAuthority: "Chief Financial Officer",
    irrevocable: true,
  };

  // 4-step progress shown beside the clock, anchored to the four rail
  // stages so the CFO sees their place in the run.
  const completedStages = stages.filter((s) => s.status === "done").length;

  return (
    <AppShell
      brand="CECL · Quarterly run"
      subtitle="CFO attestation"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="attest"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CECL · Quarterly run"
        caseId={run.id}
        stage="CFO attestation"
        backHref={`/case/${run.id}`}
        backLabel="Back to run"
      />

      {/* Sparse hero — the number being attested + the clock. */}
      <header className="grid gap-6 border-b border-rule bg-paper px-6 py-8 lg:grid-cols-[1fr_22rem]">
        <div>
          <div className="eyebrow">CFO attestation · {run.period}</div>
          <h1 className="mt-1 font-serif text-h1 font-semi text-ink-1">
            Sign off on the allowance.
          </h1>
          <p className="mt-3 max-w-xl text-body text-ink-3">
            You are attesting one number. Below: the segments that produced
            it, the exceptions that were overlaid by Credit Risk, and the
            irrevocable GL posting that follows your approval.
          </p>
          <div className="mt-6 flex items-baseline gap-8">
            <div>
              <span className="eyebrow">Allowance</span>
              <div className="mt-1 font-serif text-5xl font-semi leading-none tabular-nums text-ink-1">
                {fmtUsdM(run.totalAllowance_usd_m)}
              </div>
            </div>
            <div>
              <span className="eyebrow">QoQ delta</span>
              <div className="mt-1 font-serif text-h1 font-semi leading-none tabular-nums text-semantic-warning">
                +{fmtUsdM(run.qoqDelta_usd_m)}
              </div>
            </div>
            <div>
              <span className="eyebrow">Run progress</span>
              <div className="mt-2">
                <StepProgress
                  total={stages.length}
                  done={completedStages}
                  status={completedStages === stages.length ? "done" : "active"}
                  currentLabel={stages.find((s) => s.status === "active")?.shortLabel ?? "attesting"}
                />
              </div>
            </div>
          </div>
        </div>

        <RegulatoryClock
          startedAt={run.occClockStartedAt}
          deadline={run.occDeadlineAt}
          regulatoryRegime="OCC 30-day ALLL"
          now={new Date(run.events[run.events.length - 1]?.at ?? Date.now())}
          amberAtHoursRemaining={7 * 24}
          redAtHoursRemaining={48}
        />
      </header>

      {/* Two columns: exception ledger (LEFT) + approval gate (RIGHT) */}
      <section className="grid gap-6 px-6 py-8 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-6">
          <div className="rounded-md border border-rule bg-paper">
            <header className="border-b border-rule px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="eyebrow">Stage 3 · exception review</div>
                  <h2 className="font-serif text-h3 font-semi text-ink-1">
                    Overlaid exceptions ({exceptionsLedger.length})
                  </h2>
                </div>
                <Link
                  href={`/case/${run.id}`}
                  className="font-mono text-mono-sm text-ink-3 hover:text-accent-pressed"
                >
                  See full ledger →
                </Link>
              </div>
              <p className="mt-2 text-body-sm text-ink-3">
                Each row was flagged by the model and reviewed by Credit Risk.
                Confirm you accept the overlay before attesting.
              </p>
            </header>
            <SegmentLedger stageId="exception_review" ledger={exceptionsLedger} />
          </div>

          <div className="rounded-md border border-rule bg-paper">
            <header className="border-b border-rule px-4 py-3">
              <div className="eyebrow">Stage 4 · attestation totals</div>
              <h2 className="font-serif text-h3 font-semi text-ink-1">
                Final allowance by segment
              </h2>
              <p className="mt-2 text-body-sm text-ink-3">
                Sum of post-overlay ECL across all {ledger.length} segments.
              </p>
            </header>
            <SegmentLedger stageId="cfo_attestation" ledger={ledger} />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <AttestRespondClient caseId={run.id} recommendation={recommendation} />

          <div className="rounded-md border border-rule bg-paper p-4">
            <div className="eyebrow">Gates cleared</div>
            <ul className="mt-2 space-y-2">
              {gates.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-ui text-ink-1">{g.label}</span>
                  <StatusBadge
                    kind={
                      g.status === "completed"
                        ? "success"
                        : g.status === "pending"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {g.status}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-rule bg-paper-2 p-4">
            <div className="eyebrow">What happens on approve</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-ink-2">
              <li>Allowance posts to GL (irrevocable).</li>
              <li>SEC 10-Q draft updates.</li>
              <li>OCC ALLL filing is queued.</li>
              <li>Audit log captures attestation signature.</li>
            </ul>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
