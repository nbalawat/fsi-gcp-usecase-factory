import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import { AuditLedger } from "../../../components/AuditLedger";
import { ExamHeader } from "../../../components/ExamHeader";
import { GateRoster } from "../../../components/GateRoster";
import { ReserveBookingClient } from "../../../components/ReserveBookingClient";
import { ThresholdLedger } from "../../../components/ThresholdLedger";
import {
  MODEL_PROVIDER,
  USE_CASE_ID,
  gateStates,
  getCase,
  thresholdRows,
  toLedger,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { gate?: string };
}

/**
 * Pre-shaped recommendations per gate. Wording is fixed copy for the
 * mock; in production these come from the auditor's structured output.
 */
const RECOMMENDATIONS: Record<
  string,
  {
    decision: string;
    rationaleSummary: string;
    approvalAuthority?: string;
    proposedReserveUsd?: number;
    methodology?: string;
  }
> = {
  escalate_to_watchlist: {
    decision: "ESCALATE TO WATCHLIST",
    rationaleSummary:
      "Northeast multifamily cap-rate has compressed 32 bps since last quarter. DSCR observed (1.34×) remains above floor, but the trajectory and concentration warrant elevated monitoring per OCC Bulletin 2006-46.",
    approvalAuthority: "Credit Risk Manager",
    methodology:
      "Trailing-12-month cap-rate trend + concentration band crosswalk (BANK-CRE-POL-2026 §4.2).",
  },
  book_specific_reserve: {
    decision: "BOOK SPECIFIC RESERVE",
    rationaleSummary:
      "Despite DSCR holding at 1.34×, the cap-rate compression and Northeast concentration of 14.2% of risk-based capital justify a precautionary specific reserve under CECL methodology (OCC Bulletin 2020-49). This action posts to the GL and adjusts ALLL.",
    approvalAuthority: "Credit Committee",
    proposedReserveUsd: 3_500_000,
    methodology:
      "PD × LGD × EAD with macro overlay (BANK-CRE-POL-2026 §6.1). Spreadsheet on file; auditor narrative cites the inputs.",
  },
};

const NAV: NavItem[] = [
  { id: "exam", label: "Exam workbench", icon: "layout-dashboard", href: "/" },
  { id: "facility", label: "Facility", icon: "inbox" },
  { id: "booking", label: "Reserve booking", icon: "activity" },
  { id: "rules", label: "Threshold ledger", icon: "git-branch" },
];

/**
 * Build the per-gate ledger slice. Each slice contains everything up to
 * and including the matching `hitl_pending` row — giving the reviewer
 * the chain of custody without leaking the future.
 *
 * Pure shape transform.
 */
function buildSlice(
  rows: readonly ReturnType<typeof toLedger>[number][],
  gateId: string,
): ReturnType<typeof toLedger> {
  const pendingIdx = rows.findIndex(
    (r) => r.gate === gateId && r.kind === "hitl_pending",
  );
  if (pendingIdx === -1) return [];
  return rows.slice(0, pendingIdx + 1);
}

/**
 * Approval flow page — the OCC-style "supervisory finding" report,
 * scoped to one HITL gate. The reviewer reads the slice of the audit
 * ledger that led to the finding, then disposes.
 */
export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const allRows = toLedger(c.events);
  const gates = gateStates(c.events, c.hitl_gates);
  const thresholds = thresholdRows();

  // Default to the gate in the query string if valid; otherwise the
  // first pending gate; otherwise the first gate; otherwise the
  // irrevocable book_specific_reserve (the scope's purpose).
  const requested = searchParams?.gate;
  const requestedValid =
    requested && c.hitl_gates.includes(requested) ? requested : undefined;
  const firstPending = gates.find((g) => g.status === "pending");
  const activeGateId =
    requestedValid ??
    firstPending?.id ??
    gates[0]?.id ??
    "book_specific_reserve";
  const activeGate =
    gates.find((g) => g.id === activeGateId) ?? gates[0];

  const slice = buildSlice(allRows, activeGateId);
  const recommendation = RECOMMENDATIONS[activeGateId] ?? RECOMMENDATIONS.book_specific_reserve;

  return (
    <AppShell
      brand="CRE Surveillance"
      subtitle="Reserve booking flow"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="booking"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CRE Surveillance"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref={`/case/${c.id}`}
        backLabel="Back to facility"
      />

      <ExamHeader
        c={c}
        subtitle={
          "Supervisory finding. The reviewer reads the slice of the audit log " +
          "that led to this gate, the auditor's recommendation, and the citation " +
          "chain. The disposition becomes an examination record."
        }
        runId={`${USE_CASE_ID}-2026Q2`}
      />

      <div className="border-b border-rule bg-paper px-6 py-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="eyebrow">Active gate</span>
          <span className="font-serif text-h3 font-semi text-ink-1">
            {activeGate?.label}
          </span>
          <StatusBadge
            kind={activeGate?.irrevocable ? "danger" : "warning"}
          >
            {activeGate?.irrevocable ? "irrevocable" : "reversible"}
          </StatusBadge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Reserve booking — the primary action surface. */}
          {activeGate && (
            <ReserveBookingClient
              caseId={c.id}
              facilityTitle={c.title}
              gate={activeGate}
              recommendation={recommendation}
            />
          )}

          {/* The slice of the audit ledger that led to THIS gate. */}
          {slice.length > 0 ? (
            <AuditLedger rows={slice} />
          ) : (
            <section className="rounded-md border border-rule bg-paper p-4">
              <div className="eyebrow">Audit slice</div>
              <p className="mt-1 text-body-sm text-ink-3">
                No pending event recorded for this gate yet. The audit log
                will populate once the workflow advances.
              </p>
            </section>
          )}
        </div>

        {/* Right rail — gate roster + threshold ledger inset. */}
        <aside className="flex flex-col gap-4">
          <GateRoster
            gates={gates}
            buildHref={(g) => `/approval/${c.id}?gate=${g}`}
            activeId={activeGateId}
          />
          <ThresholdLedger rows={thresholds} />
        </aside>
      </div>
    </AppShell>
  );
}
