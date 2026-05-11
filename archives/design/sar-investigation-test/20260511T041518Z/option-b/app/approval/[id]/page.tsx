import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  RegulatoryClock,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { ClockApprovalClient } from "../../../components/ClockApprovalClient";
import {
  HITL_GATES,
  MODEL_PROVIDER,
  REG_DEADLINE_AT,
  REG_DETECTED_AT,
  USE_CASE_ID,
  gateStates,
  getCase,
  toClockSections,
  type ClockEvent,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { gate?: string };
}

// Pre-shaped recommendations per gate. The canvas-described use case
// has exactly one HITL gate (final_approval) — the BSA Officer's SAR
// signoff. Wording is fixed copy; no decision math in components per
// the architecture-auditor rule.
const RECOMMENDATIONS: Record<string, ApprovalRecommendation> = {
  final_approval: {
    decision: "FILE_SAR",
    rationaleSummary:
      "Structuring-signal rule verdict: FAIL (14 cash deposits in 7 business days, peer cohort p95 = 6). Insider-screener returned no list hit. Single-borrower exposure is well within cap. Narrative-drafter produced a 612-word SAR narrative with 0.86 citation density. Officer signoff files with FinCEN.",
    approvalAuthority: "BSA Officer",
    irrevocable: true,
  },
};

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "Case detail", icon: "inbox" },
  { id: "approval", label: "SAR signoff", icon: "activity" },
  { id: "agents", label: "Agents", icon: "bot" },
];

/**
 * Build the scope for a single gate: every clock-anchored event from the
 * start of the timeline up to and including the human_action_pending row
 * for this gate. Pure shape transform; no math beyond array slicing.
 */
function buildScope(allEvents: ClockEvent[], gateId: string): ClockEvent[] {
  const endIdx = allEvents.findIndex(
    (e) => e.actor === "gate" && e.gate === gateId,
  );
  if (endIdx === -1) return allEvents;
  return allEvents.slice(0, endIdx + 1);
}

export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const sections = toClockSections(c.events, c.detected_at, c.reg_window_days);
  const allEvents: ClockEvent[] = sections.flatMap((s) => s.events);
  const gates = gateStates(c.events, c.hitl_gates, c.detected_at, c.reg_window_days);

  const requested = searchParams?.gate;
  const requestedValid =
    requested && HITL_GATES.includes(requested) ? requested : undefined;
  const firstPending = gates.find((g) => g.status === "pending")?.id;
  const initialGateId =
    requestedValid ?? firstPending ?? gates[0]?.id ?? HITL_GATES[0] ?? "final_approval";
  const initialGate = gates.find((g) => g.id === initialGateId) ?? gates[0];

  const scope = initialGate ? buildScope(allEvents, initialGate.id) : [];
  const rec =
    RECOMMENDATIONS[initialGate?.id ?? ""] ?? {
      decision: "RETURN_FOR_REVISION",
      rationaleSummary: "Recommendation not yet generated for this gate.",
    };

  // Pinned "now" for SSR / Playwright determinism.
  const NOW = new Date("2026-05-10T12:00:00.000Z");

  return (
    <AppShell
      brand="SAR Investigations"
      subtitle="SAR signoff"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="SAR Investigations"
        caseId={c.id}
        borrowerName={c.subject.name}
        backHref={`/case/${c.id}`}
        backLabel="Back to case"
      />

      {/* HERO — the same clock, kept prominent so signoff happens
          in the shadow of the deadline. */}
      <section
        aria-label="Regulatory clock hero"
        className="border-b border-rule bg-paper px-6 py-6"
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[28rem_1fr]">
          <div>
            <RegulatoryClock
              startedAt={REG_DETECTED_AT}
              deadline={REG_DEADLINE_AT}
              regulatoryRegime="BSA SAR · 30 calendar days"
              now={NOW}
              amberAtHoursRemaining={120}
              redAtHoursRemaining={48}
            />
            <p className="mt-3 font-mono text-xs text-ink-3">
              Final SAR signoff happens against the same clock that runs the
              rest of the investigation.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <div className="eyebrow">SAR signoff</div>
              <h1 className="font-serif text-3xl font-medium text-ink-1">
                {c.title}
              </h1>
              <p className="mt-2 max-w-2xl text-ui text-ink-2">
                The case is rendered AS the clock-anchored slice of events
                that led to this gate. Read the slice, dispose — the
                disposition becomes a new event on the timeline.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
              <a
                href={`/case/${c.id}`}
                className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
              >
                ← Full timeline
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="px-6 py-5">
        {initialGate ? (
          <ClockApprovalClient
            caseId={c.id}
            gate={initialGate}
            scope={scope}
            recommendation={rec}
          />
        ) : (
          <p className="text-ink-3">No gates configured for this case.</p>
        )}
      </div>
    </AppShell>
  );
}
