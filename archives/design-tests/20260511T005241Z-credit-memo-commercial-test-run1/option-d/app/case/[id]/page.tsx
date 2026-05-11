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
import { CaseTranscript } from "../../../components/CaseTranscript";
import { GateLedger } from "../../../components/GateLedger";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  gateStates,
  getCase,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

// Banker-readable rule labels (no business logic — just renaming).
const RULE_LABEL: Record<string, string> = {
  dscr_threshold_by_industry: "DSCR threshold",
  leverage_threshold_by_industry: "Leverage threshold",
  single_borrower_exposure: "Single-borrower exposure",
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

// Surface counts straight from the case record — display-only.
function summary(c: ReturnType<typeof getCase>): {
  totalEntries: number;
  agentCalls: number;
  serviceCalls: number;
  gatesDecided: number;
  gatesTotal: number;
} {
  let agentCalls = 0;
  let serviceCalls = 0;
  let gatesDecided = 0;
  for (const e of c.events) {
    if (e.kind === "agent_invoked") agentCalls += 1;
    if (e.kind === "service_invoked") serviceCalls += 1;
    if (e.kind === "human_action") gatesDecided += 1;
  }
  return {
    totalEntries: c.events.length,
    agentCalls,
    serviceCalls,
    gatesDecided,
    gatesTotal: c.hitl_gates.length,
  };
}

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "This case", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const gates = gateStates(c.events, c.hitl_gates);
  const sum = summary(c);

  // Surface metrics — every value comes from the mock data verbatim. No
  // ratios computed, no thresholds checked in this component.
  const metrics: Metric[] = [
    {
      id: "entries",
      label: "Timeline entries",
      value: sum.totalEntries,
      tooltip: "Total events on this case",
    },
    {
      id: "agent",
      label: "Agent reasonings",
      value: sum.agentCalls,
    },
    {
      id: "service",
      label: "Service calls",
      value: sum.serviceCalls,
    },
    {
      id: "gates",
      label: "Gates decided",
      value: `${sum.gatesDecided} / ${sum.gatesTotal}`,
      state: sum.gatesDecided === sum.gatesTotal ? "ok" : "warning",
    },
    {
      id: "stage",
      label: "Current stage",
      value: c.current_stage,
    },
  ];

  const approvalHref = `/approval/${c.id}`;

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Conversation timeline"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Commercial Credit"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref="/"
        backLabel="Live floor"
      />

      {/* Hero — case identity + the recommendation, presented as the
          opening "system" turn of the conversation. */}
      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Case</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              {c.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{c.id}</span>
              <span>·</span>
              <span>{c.borrower.name}</span>
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
              {c.decision}
            </StatusBadge>
            <a
              href={approvalHref}
              className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:opacity-90"
            >
              Open approval flow →
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        {/* Main column — the transcript is the page. */}
        <CaseTranscript events={c.events} approvalHref={approvalHref} />

        {/* Right rail — gate ledger + rule verdicts + canvas pin. */}
        <aside className="flex flex-col gap-4">
          <GateLedger
            gates={gates}
            buildHref={(g) => `${approvalHref}?gate=${g}`}
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
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta="hybrid model · full compliance"
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
