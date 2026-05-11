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
import { ProvenanceGraph } from "../../../components/ProvenanceGraph";
import { ProvenanceInspector } from "../../../components/ProvenanceInspector";
import { GraphFilterTabs } from "../../../components/GraphFilterTabs";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  RULE_VERDICTS,
  SHARED_RULES,
  USE_CASE_ID,
  buildValueGraph,
  filterGraph,
  getCase,
  indexGraph,
  summarise,
  type GraphFilter,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { filter?: string; node?: string };
}

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

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "This case", icon: "inbox" },
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "rules", label: "Rules", icon: "git-branch" },
];

const VALID_FILTERS: GraphFilter[] = [
  "all",
  "extracted",
  "computed",
  "decided",
  "low-confidence",
];

export default function CaseDetailPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const allNodes = buildValueGraph();
  const graph = indexGraph(allNodes);
  const summary = summarise(allNodes);

  // Resolve filter (default: all) and selected node (default: the
  // lowest-confidence extracted value — the most useful starting point
  // for a forensic review).
  const requestedFilter = (searchParams?.filter ?? "all") as GraphFilter;
  const filter: GraphFilter = VALID_FILTERS.includes(requestedFilter)
    ? requestedFilter
    : "all";

  const filteredNodes = filterGraph(allNodes, filter);

  // Compute counts for the filter tabs straight from the un-filtered list.
  const counts: Record<GraphFilter, number> = {
    all: allNodes.length,
    extracted: filterGraph(allNodes, "extracted").length,
    computed: filterGraph(allNodes, "computed").length,
    decided: filterGraph(allNodes, "decided").length,
    "low-confidence": filterGraph(allNodes, "low-confidence").length,
  };

  const defaultSelectedId =
    filterGraph(allNodes, "low-confidence")[0]?.id ?? allNodes[0]?.id ?? "revenue";
  const requestedNode = searchParams?.node;
  const selectedNode =
    (requestedNode && graph.byId[requestedNode]) || graph.byId[defaultSelectedId] || allNodes[0];

  // Metrics — counts only, no math beyond counting.
  const metrics: Metric[] = [
    {
      id: "total",
      label: "Values in graph",
      value: summary.totalNodes,
      tooltip: "Every extracted, computed, and decided value on this case",
    },
    {
      id: "extracted",
      label: "Extracted",
      value: summary.extractedCount,
    },
    {
      id: "computed",
      label: "Computed",
      value: summary.computedCount,
    },
    {
      id: "decided",
      label: "Decided",
      value: summary.decidedCount,
    },
    {
      id: "low",
      label: "Below 92% confidence",
      value: summary.lowConfidenceCount,
      state: summary.lowConfidenceCount > 0 ? "warning" : "ok",
    },
  ];

  const buildFilterHref = (f: GraphFilter): string => {
    const params = new URLSearchParams();
    if (f !== "all") params.set("filter", f);
    if (selectedNode?.id) params.set("node", selectedNode.id);
    const q = params.toString();
    return `/case/${c.id}${q ? "?" + q : ""}`;
  };

  const buildNodeHref = (nodeId: string): string => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    params.set("node", nodeId);
    return `/case/${c.id}?${params.toString()}`;
  };

  const approvalHref = `/approval/${c.id}`;

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Provenance graph"
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

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
              Case
            </div>
            <h1 className="font-serif text-2xl font-semibold text-ink-1">
              {c.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-ink-3">
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
              className="rounded-sm bg-accent px-3 py-1.5 font-mono text-xs text-paper hover:opacity-90"
            >
              Open trust attestation →
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <GraphFilterTabs
        active={filter}
        counts={counts}
        buildHref={buildFilterHref}
      />

      <div className="grid grid-cols-1 gap-5 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        {/* Main column — the value DAG. */}
        <ProvenanceGraph
          graph={graph}
          nodes={filteredNodes}
          buildHref={buildNodeHref}
          selectedId={selectedNode?.id}
        />

        {/* Right rail — provenance inspector + rule verdicts + canvas pin. */}
        <aside className="flex flex-col gap-4">
          {selectedNode && (
            <ProvenanceInspector graph={graph} node={selectedNode} />
          )}

          <section
            aria-label="Rule verdicts"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
                Rules engine
              </div>
              <h3 className="font-serif text-base font-semibold text-ink-1">
                Verdicts
              </h3>
            </header>
            <ul className="flex flex-col">
              {SHARED_RULES.map((r) => {
                const v = RULE_VERDICTS[r] ?? "skip";
                return (
                  <li
                    key={r}
                    className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2 last:border-b-0"
                  >
                    <span className="text-sm text-ink-1">
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
            delta={`hybrid model · ${summary.meanExtractedConfidence.toFixed(2)} mean extraction conf`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
