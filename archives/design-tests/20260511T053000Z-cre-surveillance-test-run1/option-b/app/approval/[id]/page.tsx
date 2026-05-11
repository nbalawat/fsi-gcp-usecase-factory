import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatCard,
  StatusBadge,
  type ApprovalRecommendation,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { FacilityLocator } from "../../../components/FacilityLocator";
import { ReserveApprovalClient } from "../../../components/ReserveApprovalClient";
import {
  CANVAS_SHA256,
  HITL_GATES,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  REGION_AGGREGATES,
  RULE_VERDICTS,
  SHARED_RULES,
  STATE_CLUSTERS,
  USE_CASE_ID,
  fmtUsd,
  gateStates,
  getFacility,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "map", label: "Risk map", icon: "layout-dashboard", href: "/" },
  { id: "watchlist", label: "Watchlist", icon: "activity" },
  { id: "approvals", label: "Approvals", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

const RULE_LABEL: Record<string, string> = {
  cap_rate_band_check: "Cap-rate band check",
  dscr_threshold: "DSCR threshold",
};

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

export default function ApprovalPage({
  params,
}: PageProps): React.ReactElement {
  const facility = getFacility(params.id);
  const cluster = STATE_CLUSTERS.find((s) => s.state === facility.state);
  const gates = gateStates(PIPELINE_EVENTS, HITL_GATES);
  const reserveGate = gates.find((g) => g.name === "book_specific_reserve");
  const watchlistGate = gates.find((g) => g.name === "escalate_to_watchlist");

  // Display-only proposed reserve: 1.5% of exposure. NO business rule
  // — this is a recommendation seeded for the reviewer to override.
  const proposedReserveUsd = Math.round(facility.exposureUsd * 0.015);

  const recommendation: ApprovalRecommendation = {
    decision: "APPROVE",
    riskBand: facility.riskBand,
    rationaleSummary: `Agent recommends booking a specific reserve of ${fmtUsd(proposedReserveUsd)} against ${facility.borrower.name} (${facility.state}). Cap-rate band and DSCR checks have run; the regional concentration in ${facility.region} crossed the watch threshold this quarter. This action is irrevocable — GL will be posted on confirmation.`,
    approvalAuthority: "Credit Committee",
    irrevocable: true,
  };

  const metrics: Metric[] = [
    {
      id: "facility",
      label: "Facility",
      value: facility.id,
    },
    {
      id: "region",
      label: "Region",
      value: facility.region,
    },
    {
      id: "reserve",
      label: "Proposed reserve",
      value: fmtUsd(proposedReserveUsd),
      state: "warning",
    },
    {
      id: "exposure",
      label: "Exposure",
      value: fmtUsd(facility.exposureUsd),
    },
    {
      id: "authority",
      label: "Authority",
      value: "Credit Committee",
    },
  ];

  return (
    <AppShell
      brand="CRE Surveillance"
      subtitle="Map of risk · approval flow"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approvals"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CRE Surveillance"
        stage={`${facility.region} · approval`}
        caseId={facility.id}
        borrowerName={facility.borrower.name}
        backHref={`/case/${facility.id}`}
        backLabel="Facility detail"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Approval flow · book specific reserve</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              Reserve booking · {facility.borrower.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{facility.id}</span>
              <span>·</span>
              <span>{facility.property}</span>
              <span>·</span>
              <span>{facility.state}</span>
              <span>·</span>
              <span>{facility.region}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="danger">irrevocable</StatusBadge>
            <StatusBadge kind={facility.watchlist ? "warning" : "success"}>
              {facility.riskBand}
            </StatusBadge>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Map context — the user did not leave the geography metaphor. */}
          <FacilityLocator
            facility={facility}
            regions={REGION_AGGREGATES}
            cluster={cluster}
          />

          {/* The HITL surface — booking the reserve. */}
          <ReserveApprovalClient
            caseId={facility.id}
            recommendation={recommendation}
            proposedReserveUsd={proposedReserveUsd}
            proposedReserveLabel={fmtUsd(proposedReserveUsd)}
          />

          {/* Evidence — rule verdicts inline so the reviewer never has
              to leave the approval surface. */}
          <section
            aria-label="Rule verdicts"
            className="rounded-md border border-rule bg-paper p-4"
          >
            <header className="mb-3">
              <div className="eyebrow">Evidence · rules engine</div>
              <h3 className="text-h4 font-semi text-ink-1">
                Verdicts feeding this decision
              </h3>
            </header>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {SHARED_RULES.map((r) => {
                const v = RULE_VERDICTS[r] ?? "skip";
                return (
                  <li
                    key={r}
                    className="flex items-center justify-between rounded-sm border border-rule bg-paper-2 px-3 py-2"
                  >
                    <span className="text-ui text-ink-1">
                      {RULE_LABEL[r] ?? r}
                    </span>
                    <StatusBadge kind={verdictBadge(v)}>{v}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Right rail — gate ledger + canvas pin. */}
        <aside className="flex flex-col gap-4">
          <section
            aria-label="Gate ledger"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">Gate ledger</div>
              <h3 className="text-h4 font-semi text-ink-1">Decision queue</h3>
            </header>
            <ul className="flex flex-col">
              {watchlistGate && (
                <li className="flex flex-col gap-2 border-b border-rule px-3 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-ui text-ink-1">escalate_to_watchlist</div>
                    {watchlistGate.status === "decided" ? (
                      <StatusBadge kind="success">
                        {watchlistGate.decision ?? "decided"}
                      </StatusBadge>
                    ) : (
                      <StatusBadge kind="warning">pending</StatusBadge>
                    )}
                  </div>
                  <div className="font-mono text-mono-sm text-ink-3">
                    Reviewer escalates a facility to watchlist (reversible).
                  </div>
                </li>
              )}
              {reserveGate && (
                <li className="flex flex-col gap-2 px-3 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-ui text-ink-1">book_specific_reserve</div>
                    {reserveGate.status === "decided" ? (
                      <StatusBadge kind="success">
                        {reserveGate.decision ?? "decided"}
                      </StatusBadge>
                    ) : (
                      <StatusBadge kind="warning">awaiting you</StatusBadge>
                    )}
                  </div>
                  <div className="font-mono text-mono-sm text-ink-3">
                    Credit committee books a specific reserve (IRREVOCABLE).
                  </div>
                  <StatusBadge kind="danger">irrevocable</StatusBadge>
                </li>
              )}
            </ul>
          </section>

          <StatCard
            label="Facility exposure"
            value={fmtUsd(facility.exposureUsd)}
            unit={facility.borrower.naics}
            delta={`${facility.property} · ${facility.state}`}
            tone="neutral"
          />

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
