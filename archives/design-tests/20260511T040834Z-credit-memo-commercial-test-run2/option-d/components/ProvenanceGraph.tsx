import * as React from "react";
import { ValueNodeCard } from "./ValueNodeCard";
import type { ValueGraph, ValueNode } from "../lib/data";

export interface ProvenanceGraphProps {
  graph: ValueGraph;
  nodes: ValueNode[];
  /** Build a deep-link to inspect a node */
  buildHref: (nodeId: string) => string;
  /** Currently selected node id, if any */
  selectedId?: string;
}

/**
 * Renders the value DAG in topological-ish bands (extracted → computed
 * → decided). Each node is a ValueNodeCard. The order within a band
 * is the order produced by `filterGraph` / `buildValueGraph` — stable
 * and meaningful (revenue first, then ebitda, etc.).
 *
 * Server component. The href on each card carries selection state to
 * the inspector via query string — no client state needed for the
 * primary affordance.
 */
export const ProvenanceGraph: React.FC<ProvenanceGraphProps> = ({
  graph,
  nodes,
  buildHref,
  selectedId,
}) => {
  const bands: Array<{
    origin: ValueNode["origin"];
    label: string;
    eyebrow: string;
    items: ValueNode[];
  }> = [
    {
      origin: "extracted",
      label: "Layer 1 · Extracted from documents",
      eyebrow: "Origin",
      items: nodes.filter((n) => n.origin === "extracted"),
    },
    {
      origin: "computed",
      label: "Layer 2 · Computed by services and reasoned by agents",
      eyebrow: "Derived",
      items: nodes.filter((n) => n.origin === "computed"),
    },
    {
      origin: "decided",
      label: "Layer 3 · Decided by rules and humans",
      eyebrow: "Decisions",
      items: nodes.filter((n) => n.origin === "decided"),
    },
  ];

  const totalRendered = bands.reduce((s, b) => s + b.items.length, 0);

  if (totalRendered === 0) {
    return (
      <section
        aria-label="Provenance graph"
        className="rounded-md border border-rule bg-paper p-6 text-sm text-ink-3"
      >
        No values match the current filter. Clear the filter to see the
        full value DAG.
      </section>
    );
  }

  const labelFor = (id: string): string => graph.byId[id]?.label ?? id;

  return (
    <section
      aria-label="Provenance graph"
      className="flex flex-col gap-5"
    >
      {bands.map((band) => {
        if (band.items.length === 0) return null;
        return (
          <div key={band.origin}>
            <header className="mb-2 flex items-baseline gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-3">
                {band.eyebrow}
              </span>
              <h2 className="font-serif text-base font-semibold text-ink-1">
                {band.label}
              </h2>
              <span className="font-mono text-xs text-ink-3">
                {band.items.length}{" "}
                {band.items.length === 1 ? "value" : "values"}
              </span>
            </header>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {band.items.map((n) => (
                <ValueNodeCard
                  key={n.id}
                  node={n}
                  sourceLabels={n.sources.map(labelFor)}
                  consumerLabels={(graph.consumersOf[n.id] ?? []).map(labelFor)}
                  inspectHref={buildHref(n.id)}
                  selected={selectedId === n.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
};
