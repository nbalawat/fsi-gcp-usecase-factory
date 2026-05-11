import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { GraphEdge, GraphNode } from "../lib/data";

export interface EdgeInspectorProps {
  /** Currently selected node, if any */
  node?: GraphNode;
  /** Edges incident to the selected node */
  edges: GraphEdge[];
  /** Set of edge indices currently in the SAR sub-graph selection */
  selectedEdgeIdx: ReadonlySet<number>;
  /** Toggle one edge in/out of the selection */
  onToggleEdge: (idx: number) => void;
}

const kindBadge = (k: GraphEdge["kind"]): "danger" | "warning" | "info" | "neutral" => {
  if (k === "wire-out") return "danger";
  if (k === "wire-in") return "info";
  if (k === "aggregate") return "warning";
  if (k === "agent-finding") return "info";
  return "neutral";
};

/**
 * Right-rail inspector for the currently focused node. Lists every
 * edge incident to that node with a checkbox that toggles its
 * membership in the SAR sub-graph selection. Pure presentation —
 * receives fully-shaped edges from the adapter.
 */
export const EdgeInspector: React.FC<EdgeInspectorProps> = ({
  node,
  edges,
  selectedEdgeIdx,
  onToggleEdge,
}) => {
  if (!node) {
    return (
      <section
        aria-label="Edge inspector"
        className="rounded-md border border-rule bg-paper"
      >
        <header className="border-b border-rule px-3 py-2">
          <div className="eyebrow">Inspector</div>
          <h3 className="text-h4 font-semi text-ink-1">Pick a node</h3>
        </header>
        <p className="px-3 py-4 text-caption text-ink-3">
          Click any node in the graph to see its incident edges. Click
          edges to toggle them in the SAR narrative selection.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label={`Edge inspector for ${node.label}`}
      className="rounded-md border border-rule bg-paper"
    >
      <header className="border-b border-rule px-3 py-2">
        <div className="eyebrow">Inspector</div>
        <h3 className="text-h4 font-semi text-ink-1">{node.label}</h3>
        {node.detail && (
          <p className="font-mono text-mono-sm text-ink-3">{node.detail}</p>
        )}
      </header>
      {edges.length === 0 ? (
        <p className="px-3 py-4 text-caption text-ink-3">
          No edges incident to this node.
        </p>
      ) : (
        <ul className="flex flex-col">
          {edges.map((e) => {
            const isSelected = selectedEdgeIdx.has(e.idx);
            return (
              <li
                key={e.idx}
                className="flex flex-col gap-1 border-b border-rule px-3 py-2.5 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ui font-medium text-ink-1">
                    {e.label}
                  </span>
                  <StatusBadge kind={kindBadge(e.kind)}>{e.kind}</StatusBadge>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-mono-sm text-ink-3">
                  <span>{e.at.substring(11, 19)} UTC</span>
                  {e.signal && <span>signal: {e.signal}</span>}
                  {e.meta?.latencyMs !== undefined && (
                    <span>{e.meta.latencyMs}ms</span>
                  )}
                  {e.meta?.tokensIn !== undefined && (
                    <span>↑ {e.meta.tokensIn}t</span>
                  )}
                  {e.meta?.tokensOut !== undefined && (
                    <span>↓ {e.meta.tokensOut}t</span>
                  )}
                </div>
                <label className="mt-1 flex items-center gap-2 font-mono text-mono-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleEdge(e.idx)}
                    aria-label={`Include ${e.label} in SAR narrative`}
                    className="h-3.5 w-3.5 rounded-sm"
                  />
                  {isSelected ? "in SAR narrative" : "exclude from SAR"}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
