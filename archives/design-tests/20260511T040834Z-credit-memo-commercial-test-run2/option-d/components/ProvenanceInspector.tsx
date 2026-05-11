import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { ValueGraph, ValueNode } from "../lib/data";
import { backwardChain, forwardChain } from "../lib/data";

export interface ProvenanceInspectorProps {
  graph: ValueGraph;
  node: ValueNode;
}

/**
 * Right-rail forensic inspector for one value. Shows the full backward
 * chain (every transitive source, with citation excerpts inline for
 * leaves) and the full forward chain (every transitive consumer up to
 * the final decision). Pure render — no interactivity, no client.
 */
export const ProvenanceInspector: React.FC<ProvenanceInspectorProps> = ({
  graph,
  node,
}) => {
  const back = backwardChain(graph, node.id);
  const fwd = forwardChain(graph, node.id);

  const conf = node.confidence;
  const confTone: "success" | "warning" | "danger" | "neutral" =
    conf === undefined
      ? "neutral"
      : conf >= 0.94
        ? "success"
        : conf >= 0.9
          ? "warning"
          : "danger";

  return (
    <aside
      aria-label="Provenance inspector"
      className="flex flex-col gap-3 rounded-md border border-rule bg-paper"
    >
      <header className="border-b border-rule px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
          Inspect
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg font-semibold text-ink-1">
            {node.label}
          </h2>
          {conf !== undefined && (
            <StatusBadge kind={confTone}>
              {Math.round(conf * 100)}% conf
            </StatusBadge>
          )}
        </div>
        <div className="mt-1 font-serif text-2xl font-semibold text-ink-1">
          {node.display}
        </div>
        <p className="mt-2 text-sm text-ink-2">{node.derivation}</p>
      </header>

      {/* Backward chain — sources */}
      <section
        aria-label="Backward chain"
        className="border-b border-rule px-4 py-3"
      >
        <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
          ← Backward chain · {back.length === 1 ? "leaf" : `${back.length} steps to source`}
        </div>
        <ol className="mt-2 flex flex-col gap-2">
          {back.map((n, i) => (
            <li
              key={n.id}
              className="rounded-sm border border-rule bg-paper-2 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-ink-3">
                    {i === 0 ? "self" : `−${i}`}
                  </span>
                  <span className="ml-2 text-sm font-medium text-ink-1">
                    {n.label}
                  </span>
                </div>
                <span className="font-mono text-xs text-ink-2">
                  {n.display}
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-ink-3">
                {n.producer} ({n.producerKind})
              </div>
              {n.citation && (
                <blockquote className="mt-2 border-l-2 border-accent pl-2 text-xs italic text-ink-2">
                  &ldquo;{n.citation.excerpt}&rdquo;
                  <div className="not-italic font-mono text-xs text-ink-3">
                    {n.citation.chunk_id} · p.{n.citation.page} · bbox{" "}
                    {n.citation.bbox.map((x) => x.toFixed(2)).join(",")} ·{" "}
                    {Math.round(n.citation.confidence * 100)}%
                  </div>
                </blockquote>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Forward chain — consumers */}
      <section aria-label="Forward chain" className="px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
          → Forward chain ·{" "}
          {fwd.length === 0
            ? "terminal"
            : `${fwd.length} downstream consumers`}
        </div>
        {fwd.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">
            No downstream consumers. This value feeds the final decision
            directly (or is a leaf with no consumers yet).
          </p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2">
            {fwd.map((n, i) => (
              <li
                key={n.id}
                className="rounded-sm border border-rule bg-paper-2 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-ink-3">
                      +{i + 1}
                    </span>
                    <span className="ml-2 text-sm font-medium text-ink-1">
                      {n.label}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-ink-2">
                    {n.display}
                  </span>
                </div>
                <div className="mt-1 font-mono text-xs text-ink-3">
                  {n.producer} ({n.producerKind})
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
};
