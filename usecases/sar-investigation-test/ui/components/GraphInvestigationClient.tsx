"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import { CounterpartyGraph } from "./CounterpartyGraph";
import { EdgeInspector } from "./EdgeInspector";
import { NarrativeDraft } from "./NarrativeDraft";
import { AuditLedger } from "./AuditLedger";
import {
  buildNarrative,
  defaultSelection,
  toAuditRows,
  toCounterpartyGraph,
} from "../lib/data";

interface RawEvt {
  at: string;
  kind: string;
  stage?: string;
  doc_type?: string;
  service?: string;
  agent?: string;
  gate?: string;
  decision?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  confidence?: number;
}

export interface GraphInvestigationClientProps {
  caseId: string;
  borrowerName: string;
  events: readonly RawEvt[];
  /** Where the "Open SAR filing" link should go */
  approvalHref: string;
}

/**
 * The case-detail page's beating heart. Holds:
 *   - which edges are currently in the SAR sub-graph selection
 *   - which node is currently focused
 * Re-renders the graph, inspector, narrative, and audit ledger in sync.
 *
 * No business logic here. Shape transforms happen in `lib/data.ts`;
 * this component just wires the interactive state up to those pure
 * functions.
 */
export const GraphInvestigationClient: React.FC<GraphInvestigationClientProps> = ({
  caseId,
  borrowerName,
  events,
  approvalHref,
}) => {
  const graph = React.useMemo(
    () => toCounterpartyGraph(caseId, borrowerName, events),
    [caseId, borrowerName, events],
  );
  const auditRows = React.useMemo(() => toAuditRows(events), [events]);
  const defaultSel = React.useMemo(() => defaultSelection(graph), [graph]);

  const [selectedEdgeIdx, setSelectedEdgeIdx] = React.useState<Set<number>>(
    () => new Set(defaultSel),
  );
  const [selectedNodeId, setSelectedNodeId] = React.useState<string>(
    graph.subject.id,
  );

  const toggleEdge = React.useCallback((idx: number): void => {
    setSelectedEdgeIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const selectNode = React.useCallback((id: string): void => {
    setSelectedNodeId(id);
  }, []);

  const resetSelection = React.useCallback((): void => {
    setSelectedEdgeIdx(new Set(defaultSel));
  }, [defaultSel]);

  const clearSelection = React.useCallback((): void => {
    setSelectedEdgeIdx(new Set());
  }, []);

  const selectAll = React.useCallback((): void => {
    setSelectedEdgeIdx(new Set(graph.edges.map((e) => e.idx)));
  }, [graph.edges]);

  // Edges incident to the focused node.
  const focusedNode = graph.nodes.find((n) => n.id === selectedNodeId);
  const incidentEdges = React.useMemo(
    () =>
      graph.edges.filter(
        (e) => e.from === selectedNodeId || e.to === selectedNodeId,
      ),
    [graph.edges, selectedNodeId],
  );

  const narrative = React.useMemo(
    () => buildNarrative(graph, selectedEdgeIdx, borrowerName),
    [graph, selectedEdgeIdx, borrowerName],
  );

  return (
    <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
      {/* Main column — graph + narrative */}
      <div className="flex flex-col gap-4">
        <section
          aria-label="Counterparty graph and selection controls"
          className="rounded-md border border-rule bg-paper"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
            <div>
              <div className="eyebrow">Counterparty graph</div>
              <h2 className="font-serif text-h3 font-semi text-ink-1">
                {borrowerName} · related-parties network
              </h2>
              <p className="mt-1 text-caption text-ink-3">
                Click edges to add them to the SAR narrative; click nodes to
                inspect incident transactions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge kind="info">
                {selectedEdgeIdx.size} / {graph.edges.length} edges in narrative
              </StatusBadge>
              <button
                type="button"
                onClick={resetSelection}
                className="rounded-sm border border-rule bg-paper px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
              >
                Reset to default
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-sm border border-rule bg-paper px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={selectAll}
                className="rounded-sm border border-rule bg-paper px-3 py-1 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
              >
                Select all
              </button>
            </div>
          </header>
          <div className="px-4 py-3">
            <CounterpartyGraph
              graph={graph}
              selectedEdgeIdx={selectedEdgeIdx}
              selectedNodeId={selectedNodeId}
              onToggleEdge={toggleEdge}
              onSelectNode={selectNode}
            />
          </div>
        </section>

        <NarrativeDraft
          blocks={narrative}
          selectionCount={selectedEdgeIdx.size}
          defaultCount={defaultSel.size}
        />

        <div className="flex items-center justify-end gap-2">
          <a
            href={approvalHref}
            className="rounded-sm bg-accent px-4 py-2 font-mono text-mono-sm text-paper hover:opacity-90"
          >
            Open SAR filing →
          </a>
        </div>
      </div>

      {/* Right rail — inspector + audit ledger */}
      <aside className="flex flex-col gap-4">
        <EdgeInspector
          node={focusedNode}
          edges={incidentEdges}
          selectedEdgeIdx={selectedEdgeIdx}
          onToggleEdge={toggleEdge}
        />
        <AuditLedger
          rows={auditRows}
          selectedEdgeIdx={selectedEdgeIdx}
          onToggleEdge={toggleEdge}
        />
      </aside>
    </div>
  );
};
