import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  StatCard,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { BookReserveClient } from "../../../components/BookReserveClient";
import {
  CANVAS_SHA256,
  HITL_GATES,
  MODEL_PROVIDER,
  RISK_DIMENSIONS,
  USE_CASE_ID,
  bandLabel,
  gateStates,
  getFacility,
  shortUsd,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { gate?: string };
}

const NAV: NavItem[] = [
  { id: "grid",     label: "Grid",     icon: "layout-dashboard", href: "/" },
  { id: "case",     label: "Facility", icon: "inbox" },
  { id: "approval", label: "Approval", icon: "activity" },
];

const RECOMMENDATIONS: Record<string, ApprovalRecommendation> = {
  escalate_to_watchlist: {
    decision: "ESCALATE",
    rationaleSummary:
      "Aggregated-stage agent flagged drift on two risk dimensions vs. peers in the same NAICS. Moving the facility to the watchlist is reversible and triggers a quarterly re-review.",
    approvalAuthority: "Portfolio Manager",
    irrevocable: false,
  },
  book_specific_reserve: {
    decision: "BOOK RESERVE",
    rationaleSummary:
      "Cap-rate-band-check and DSCR-threshold rule verdicts plus the peer-and-industry-context agent both indicate impairment exposure. The credit committee may book a specific reserve. This action posts to the general ledger and is irrevocable.",
    approvalAuthority: "Credit Committee",
    irrevocable: true,
  },
};

export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const facility = getFacility(params.id);
  const gates = gateStates();

  // Prefer the gate from the query string if it's valid; else default to
  // the irrevocable "book_specific_reserve" — the one this page is for.
  const requested = searchParams?.gate;
  const validNames = HITL_GATES.map((g) => g.name);
  const initialGate =
    requested && validNames.includes(requested)
      ? requested
      : "book_specific_reserve";
  const activeGate = HITL_GATES.find((g) => g.name === initialGate) ?? HITL_GATES[0];
  const recommendation =
    RECOMMENDATIONS[activeGate.name] ?? RECOMMENDATIONS.book_specific_reserve;

  const breachCells = RISK_DIMENSIONS.filter((d) => {
    const b = facility.bands[d.id];
    return b === "3-substandard" || b === "4-doubtful" || b === "5-loss";
  }).length;
  const watchCells = RISK_DIMENSIONS.filter(
    (d) => facility.bands[d.id] === "2-special-mention",
  ).length;

  return (
    <AppShell
      brand="CRE surveillance"
      subtitle="Reserve flow"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CRE surveillance"
        caseId={facility.id}
        borrowerName={facility.borrowerName}
        backHref={`/case/${facility.id}`}
        backLabel="Back to facility"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">HITL gate</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {activeGate.name.replace(/_/g, " ")}
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-3">
              {activeGate.description}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind={activeGate.irrevocable ? "danger" : "warning"}>
              {activeGate.irrevocable ? "irrevocable" : "reversible"}
            </StatusBadge>
            <a
              href={`/case/${facility.id}`}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
            >
              ← Facility detail
            </a>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-3">
        {/* Main column — the approval gate. */}
        <div className="lg:col-span-2">
          <BookReserveClient
            facilityId={facility.id}
            recommendation={recommendation}
          />
        </div>

        {/* Right rail — facility context the approver needs at glance. */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-md border border-rule bg-paper">
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">Facility</div>
              <h2 className="text-h4 font-semi text-ink-1">
                {facility.borrowerName}
              </h2>
            </header>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 font-mono text-mono-sm">
              <dt className="text-ink-3">id</dt>
              <dd className="text-ink-1">{facility.id}</dd>
              <dt className="text-ink-3">geo</dt>
              <dd className="text-ink-1">{facility.geo}</dd>
              <dt className="text-ink-3">naics</dt>
              <dd className="text-ink-1">{facility.naics}</dd>
              <dt className="text-ink-3">exposure</dt>
              <dd className="text-ink-1">{shortUsd(facility.exposureUsd)}</dd>
              <dt className="text-ink-3">anchor band</dt>
              <dd className="text-ink-1">
                {bandLabel(facility.bands.dscr).toLowerCase()}
              </dd>
            </dl>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Watch cells"
              value={watchCells}
              tone={watchCells > 0 ? "warning" : "neutral"}
            />
            <StatCard
              label="Breach cells"
              value={breachCells}
              tone={breachCells > 0 ? "danger" : "neutral"}
            />
          </div>

          <section className="rounded-md border border-rule bg-paper">
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">Gates on this facility</div>
              <h3 className="text-h4 font-semi text-ink-1">Ledger</h3>
            </header>
            <ul className="flex flex-col">
              {gates.map((g) => (
                <li
                  key={g.name}
                  className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-ui text-ink-1">
                    {g.name.replace(/_/g, " ")}
                  </span>
                  <StatusBadge
                    kind={
                      g.status === "decided"
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
          </section>

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER}`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
