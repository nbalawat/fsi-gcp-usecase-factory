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
import { CellDetail } from "../../../components/CellDetail";
import { GateLedger } from "../../../components/GateLedger";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  RISK_DIMENSIONS,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  bandLabel,
  gateStates,
  getFacility,
  shortUsd,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "grid",   label: "Grid",     icon: "layout-dashboard", href: "/" },
  { id: "case",   label: "Facility", icon: "inbox" },
  { id: "rules",  label: "Rules",    icon: "git-branch" },
  { id: "agents", label: "Agents",   icon: "bot" },
];

// Banker-readable rule labels (no business logic — just renaming).
const RULE_LABEL: Record<string, string> = {
  cap_rate_band_check: "Cap rate band check",
  dscr_threshold:      "DSCR threshold",
};

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const facility = getFacility(params.id);
  const gates = gateStates();

  // Surface metrics — anchor band, exposure, watch/breach dimensions.
  const cellBands = RISK_DIMENSIONS.map((d) => facility.bands[d.id]);
  const watchCells = cellBands.filter((b) => b === "2-special-mention").length;
  const breachCells = cellBands.filter(
    (b) => b === "3-substandard" || b === "4-doubtful" || b === "5-loss",
  ).length;

  const metrics: Metric[] = [
    { id: "id",        label: "Facility",     value: facility.id },
    { id: "exposure",  label: "Exposure",     value: shortUsd(facility.exposureUsd) },
    { id: "geo",       label: "Geo",          value: facility.geo },
    { id: "watch",     label: "Watch cells",  value: watchCells,
      state: watchCells > 0 ? "warning" : "ok" },
    { id: "breach",    label: "Breach cells", value: breachCells,
      state: breachCells > 0 ? "alert" : "ok" },
  ];

  const approvalHref = `/approval/${facility.id}`;

  return (
    <AppShell
      brand="CRE surveillance"
      subtitle="Cell detail"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="CRE surveillance"
        caseId={facility.id}
        borrowerName={facility.borrowerName}
        backHref="/"
        backLabel="Grid"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Facility</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {facility.borrowerName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{facility.id}</span>
              <span>·</span>
              <span>{facility.geo}</span>
              <span>·</span>
              <span>NAICS {facility.naics}</span>
              <span>·</span>
              <span>{shortUsd(facility.exposureUsd)} exposure</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="info">
              anchor: {bandLabel(facility.bands.dscr).toLowerCase()}
            </StatusBadge>
            <a
              href={approvalHref}
              className="rounded-sm bg-accent px-3 py-1 font-mono text-mono-sm text-paper hover:bg-accent-hover"
            >
              Open reserve flow →
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <CellDetail facility={facility} />
        </div>

        <aside className="flex flex-col gap-4 lg:col-span-1">
          <GateLedger facilityId={facility.id} gates={gates} />

          <section
            aria-label="Rule verdicts"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">Rules engine</div>
              <h3 className="text-h4 font-semi text-ink-1">Verdicts</h3>
            </header>
            <ul className="flex flex-col">
              {SHARED_RULES.map((r) => {
                const v = RULE_VERDICTS[r] ?? "skip";
                return (
                  <li
                    key={r}
                    className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
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

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · canvas`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
