import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  RegulatoryClock,
  StatCard,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { GraphInvestigationClient } from "../../../components/GraphInvestigationClient";
import {
  AUDITOR_CANVAS_SHA256,
  MODEL_PROVIDER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  gateStates,
  getCase,
  sarClockWindow,
  toCounterpartyGraph,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

// Banker-readable rule labels (no business logic — just renaming).
const RULE_LABEL: Record<string, string> = {
  single_borrower_exposure: "Single-borrower exposure",
  insider_aggregate_limit: "Insider aggregate limit",
  reg_o_individual_limit: "Reg O individual limit",
};

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

const NAV: NavItem[] = [
  { id: "live", label: "Alert queue", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "This case", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const gates = gateStates(c.events, c.hitl_gates);
  const graph = toCounterpartyGraph(c.id, c.borrower.name, c.events);
  const clockWindow = sarClockWindow(c.events);

  // Counts straight from the graph shape — no math, no thresholds.
  const counterpartyCount = graph.nodes.filter(
    (n) => n.kind === "counterparty",
  ).length;
  const agentCount = graph.nodes.filter((n) => n.kind === "agent").length;
  const edgeCount = graph.edges.length;
  const flaggedCount = graph.edges.filter((e) => e.defaultSelected).length;

  const metrics: Metric[] = [
    {
      id: "counterparties",
      label: "Counterparties",
      value: counterpartyCount,
      tooltip: "Distinct related parties on the graph",
    },
    {
      id: "edges",
      label: "Transactions",
      value: edgeCount,
      tooltip: "Total edges in the case graph",
    },
    {
      id: "flagged",
      label: "Default-flagged",
      value: flaggedCount,
      state: flaggedCount > 0 ? "warning" : "ok",
      tooltip: "Edges pre-selected as suspicious by the canvas",
    },
    {
      id: "agents",
      label: "Agents engaged",
      value: agentCount,
    },
    {
      id: "stage",
      label: "Stage",
      value: c.current_stage,
    },
  ];

  const approvalHref = `/approval/${c.id}`;

  return (
    <AppShell
      brand="BSA/AML"
      subtitle="SAR investigation · graph view"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="BSA/AML SAR"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref="/"
        backLabel="Alert queue"
      />

      {/* Hero — case identity + regulatory clock. */}
      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">SAR case</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {c.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{c.id}</span>
              <span>·</span>
              <span>subject: {c.borrower.name}</span>
              <span>·</span>
              <span>{c.borrower.geo}</span>
              <span>·</span>
              <span>NAICS {c.borrower.naics}</span>
              <span>·</span>
              <span>band {c.borrower.risk_band}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
            <StatusBadge
              kind={c.decision === "approve" ? "success" : "neutral"}
            >
              {c.decision === "approve" ? "filed" : c.decision}
            </StatusBadge>
            <a
              href={approvalHref}
              className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:opacity-90"
            >
              Open SAR filing →
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      {/* The graph IS the page. */}
      <GraphInvestigationClient
        caseId={c.id}
        borrowerName={c.borrower.name}
        events={c.events}
        approvalHref={approvalHref}
      />

      {/* Bottom strip — regulatory clock + rule verdicts + canvas pin.
          Keeps the SAR-specific compliance instruments visible without
          stealing the graph's spotlight. */}
      <section className="grid grid-cols-1 gap-4 border-t border-rule bg-paper-2 px-6 py-5 lg:grid-cols-[1fr_1fr_1fr]">
        <RegulatoryClock
          startedAt={clockWindow.startedAt}
          deadline={clockWindow.deadline}
          regulatoryRegime={clockWindow.regulatoryRegime}
        />

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
          value={`${AUDITOR_CANVAS_SHA256.substring(0, 8)}…`}
          unit="pinned"
          delta={`${gates.length} HITL gate${gates.length === 1 ? "" : "s"} · ${MODEL_PROVIDER}`}
          tone="neutral"
        />
      </section>
    </AppShell>
  );
}
