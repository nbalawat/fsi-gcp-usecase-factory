import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  StatusBadge,
  type NavItem,
} from "@fsi-bank/components";
import { TrustAttestationClient } from "../../../components/TrustAttestationClient";
import {
  GATE_SCOPES,
  HITL_GATES,
  MODEL_PROVIDER,
  USE_CASE_ID,
  buildValueGraph,
  gateStates,
  getCase,
  indexGraph,
  type ValueNode,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
  searchParams?: { gate?: string };
}

const NAV: NavItem[] = [
  { id: "live", label: "Live floor", icon: "layout-dashboard", href: "/" },
  { id: "case", label: "Case detail", icon: "inbox" },
  { id: "approval", label: "Approval flow", icon: "activity" },
  { id: "agents", label: "Agents", icon: "bot" },
];

/**
 * Pre-resolve each gate's scope from value-id list → ValueNode list, in
 * the order declared by GATE_SCOPES (which is the order the reviewer
 * sees them). Pure shape transform.
 */
function buildScopeNodes(
  allNodes: ValueNode[],
): Record<string, ValueNode[]> {
  const byId: Record<string, ValueNode> = {};
  for (const n of allNodes) byId[n.id] = n;
  const out: Record<string, ValueNode[]> = {};
  for (const g of Object.keys(GATE_SCOPES)) {
    const scope = GATE_SCOPES[g];
    out[g] = scope.valueIds
      .map((id) => byId[id])
      .filter((n): n is ValueNode => Boolean(n));
  }
  return out;
}

export default function ApprovalPage({
  params,
  searchParams,
}: PageProps): React.ReactElement {
  const c = getCase(params.id);
  const allNodes = buildValueGraph();
  const graph = indexGraph(allNodes);
  const scopeNodes = buildScopeNodes(allNodes);
  const gates = gateStates(c.events, c.hitl_gates);

  const requested = searchParams?.gate;
  const requestedValid =
    requested && HITL_GATES.includes(requested) ? requested : undefined;
  const firstPending = gates.find((g) => g.status === "pending")?.id;
  const initialGate =
    requestedValid ?? firstPending ?? gates[0]?.id ?? HITL_GATES[0] ?? "extraction_review";

  return (
    <AppShell
      brand="Commercial Credit"
      subtitle="Trust attestation"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Commercial Credit"
        caseId={c.id}
        borrowerName={c.borrower.name}
        backHref={`/case/${c.id}`}
        backLabel="Back to case"
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
              Approval flow
            </div>
            <h1 className="font-serif text-2xl font-semibold text-ink-1">
              {c.title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-3">
              Each gate is reframed as a trust attestation over a subtree
              of values. Pick a gate, review the values you&rsquo;re
              signing off on (lowest confidence first), and dispose.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
            <a
              href={`/case/${c.id}`}
              className="rounded-sm border border-rule px-3 py-1 font-mono text-xs text-ink-2 hover:bg-paper-2"
            >
              ← Back to value graph
            </a>
          </div>
        </div>
      </header>

      <div className="px-6 py-5">
        <TrustAttestationClient
          caseId={c.id}
          gates={gates}
          scopes={GATE_SCOPES}
          scopeNodes={scopeNodes}
          graph={graph}
          initialGate={initialGate}
        />
      </div>
    </AppShell>
  );
}
