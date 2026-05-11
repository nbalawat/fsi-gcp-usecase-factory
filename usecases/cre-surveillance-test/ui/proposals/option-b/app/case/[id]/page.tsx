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
import { FacilityLocator } from "../../../components/FacilityLocator";
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

const agentEvents = PIPELINE_EVENTS.filter((e) => e.kind === "agent_invoked");
const serviceEvents = PIPELINE_EVENTS.filter(
  (e) => e.kind === "service_invoked",
);

export default function CaseDetailPage({
  params,
}: PageProps): React.ReactElement {
  const facility = getFacility(params.id);
  const cluster = STATE_CLUSTERS.find((s) => s.state === facility.state);
  const gates = gateStates(PIPELINE_EVENTS, HITL_GATES);

  const metrics: Metric[] = [
    {
      id: "state",
      label: "Location",
      value: facility.state,
    },
    {
      id: "region",
      label: "Region",
      value: facility.region,
    },
    {
      id: "risk",
      label: "Risk band",
      value: facility.riskBand,
      state: facility.watchlist ? "warning" : "ok",
    },
    {
      id: "exposure",
      label: "Exposure",
      value: fmtUsd(facility.exposureUsd),
    },
    {
      id: "gates",
      label: "Gates",
      value: `${gates.filter((g) => g.status === "decided").length} / ${gates.length}`,
      state:
        gates.every((g) => g.status === "decided") ? "ok" : "warning",
    },
  ];

  // Find a pending gate (if any) so the page can offer a deep link.
  const pendingGate = gates.find((g) => g.status === "pending");
  const reserveGate = gates.find((g) => g.name === "book_specific_reserve");
  const approvalHref = `/approval/${facility.id}`;

  return (
    <AppShell
      brand="CRE Surveillance"
      subtitle="Map of risk"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="map"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CRE Surveillance"
        stage={facility.region}
        caseId={facility.id}
        borrowerName={facility.borrower.name}
        backHref="/"
        backLabel="Risk map"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Facility</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {facility.property} · {facility.borrower.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{facility.id}</span>
              <span>·</span>
              <span>{facility.state}</span>
              <span>·</span>
              <span>{facility.region}</span>
              <span>·</span>
              <span>NAICS {facility.borrower.naics}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind={facility.watchlist ? "warning" : "success"}>
              {facility.riskBand}
            </StatusBadge>
            {reserveGate && reserveGate.status !== "decided" && (
              <a
                href={approvalHref}
                className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:bg-accent-hover"
              >
                Open reserve flow →
              </a>
            )}
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-3">
        {/* Main column — locator (map) + facility evidence. */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <FacilityLocator
            facility={facility}
            regions={REGION_AGGREGATES}
            cluster={cluster}
          />

          {/* Rule verdicts — small at-a-glance grid. */}
          <section
            aria-label="Rule verdicts"
            className="rounded-md border border-rule bg-paper p-4"
          >
            <header className="mb-3">
              <div className="eyebrow">Rules engine</div>
              <h3 className="text-h4 font-semi text-ink-1">Verdicts on this facility</h3>
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

          {/* Agent + service activity — chronological. */}
          <section
            aria-label="Agent and service activity"
            className="rounded-md border border-rule bg-paper p-4"
          >
            <header className="mb-3">
              <div className="eyebrow">Agent activity</div>
              <h3 className="text-h4 font-semi text-ink-1">
                What the agents did on this facility
              </h3>
            </header>
            <ol className="flex flex-col gap-2">
              {[...serviceEvents, ...agentEvents]
                .sort((a, b) => (a.at < b.at ? -1 : 1))
                .map((e, idx) => (
                  <li
                    key={`${e.kind}-${idx}`}
                    className="flex items-baseline justify-between gap-3 border-b border-rule pb-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="text-ui text-ink-1">
                        {e.kind === "agent_invoked"
                          ? `agent · ${e.agent}`
                          : `service · ${e.service}`}
                      </div>
                      <div className="font-mono text-mono-sm text-ink-3">
                        {e.at}
                      </div>
                    </div>
                    <div className="text-right font-mono text-mono-sm text-ink-2">
                      {e.kind === "agent_invoked" ? (
                        <>
                          {e.tokens_in ?? 0} in · {e.tokens_out ?? 0} out
                        </>
                      ) : (
                        <>{e.latency_ms ?? 0} ms</>
                      )}
                    </div>
                  </li>
                ))}
            </ol>
          </section>
        </div>

        {/* Right rail — gate ledger + canvas pin. */}
        <aside className="flex flex-col gap-4">
          <section
            aria-label="Human gates"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">Human gates</div>
              <h3 className="text-h4 font-semi text-ink-1">Decision queue</h3>
            </header>
            <ul className="flex flex-col">
              {gates.map((g) => (
                <li
                  key={g.name}
                  className="flex flex-col gap-2 border-b border-rule px-3 py-3 last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-ui text-ink-1">{g.name}</div>
                    {g.status === "decided" && (
                      <StatusBadge kind="success">
                        {g.decision ?? "decided"}
                      </StatusBadge>
                    )}
                    {g.status === "pending" && (
                      <StatusBadge kind="warning">pending</StatusBadge>
                    )}
                    {g.status === "not-reached" && (
                      <StatusBadge kind="neutral">not reached</StatusBadge>
                    )}
                  </div>
                  <div className="font-mono text-mono-sm text-ink-3">
                    {g.description}
                  </div>
                  {g.irrevocable && (
                    <StatusBadge kind="danger">irrevocable</StatusBadge>
                  )}
                  {g.status !== "decided" && (
                    <a
                      href={`${approvalHref}?gate=${g.name}`}
                      className="self-start rounded-sm border border-rule px-2 py-1 font-mono text-mono-sm text-ink-1 hover:bg-paper-2"
                    >
                      Respond →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {pendingGate && (
            <StatCard
              label="Action required"
              value={pendingGate.name}
              unit={pendingGate.irrevocable ? "irrevocable" : "reversible"}
              delta="Open approval flow to respond"
              tone={pendingGate.irrevocable ? "danger" : "warning"}
            />
          )}

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
