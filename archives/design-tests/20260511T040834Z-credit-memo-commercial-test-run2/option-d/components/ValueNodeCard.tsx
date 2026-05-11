import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { ValueNode } from "../lib/data";

export interface ValueNodeCardProps {
  node: ValueNode;
  /** Backward source labels, pre-resolved */
  sourceLabels: string[];
  /** Forward consumer labels, pre-resolved */
  consumerLabels: string[];
  /** Where to navigate when the inspector should open this node */
  inspectHref: string;
  /** Visually mark this node as the one currently selected in the inspector */
  selected?: boolean;
}

const KIND_LABEL: Record<ValueNode["producerKind"], string> = {
  service: "atomic service",
  agent: "agent",
  rules: "rules engine",
  human: "human gate",
};

const ORIGIN_BADGE: Record<
  ValueNode["origin"],
  "info" | "neutral" | "accent"
> = {
  extracted: "info",
  computed: "neutral",
  decided: "accent",
};

const ORIGIN_LABEL: Record<ValueNode["origin"], string> = {
  extracted: "extracted",
  computed: "computed",
  decided: "decided",
};

/**
 * One card in the value DAG. Renders the value itself (serif headline),
 * its producer + confidence, its source citation excerpt (if any), and
 * compact lists of upstream/downstream values. The whole card is a link
 * to the provenance inspector for this node.
 */
export const ValueNodeCard: React.FC<ValueNodeCardProps> = ({
  node,
  sourceLabels,
  consumerLabels,
  inspectHref,
  selected = false,
}) => {
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
    <article
      aria-label={`Value node: ${node.label}`}
      className={
        "rounded-md border bg-paper transition-colors " +
        (selected
          ? "border-accent ring-2 ring-accent ring-offset-1"
          : "border-rule hover:border-border-strong")
      }
    >
      <a
        href={inspectHref}
        className="block px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
              {node.label}
            </div>
            <div className="mt-0.5 font-serif text-xl font-semibold text-ink-1">
              {node.display}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge kind={ORIGIN_BADGE[node.origin]}>
              {ORIGIN_LABEL[node.origin]}
            </StatusBadge>
            {conf !== undefined && (
              <StatusBadge kind={confTone}>
                {Math.round(conf * 100)}% conf
              </StatusBadge>
            )}
          </div>
        </header>

        <div className="mt-2 font-mono text-xs text-ink-3">
          via {KIND_LABEL[node.producerKind]} ·{" "}
          <span className="text-ink-2">{node.producer}</span>
        </div>

        {node.citation && (
          <blockquote className="mt-2 border-l-2 border-rule pl-2 text-xs italic text-ink-2">
            &ldquo;{node.citation.excerpt}&rdquo;
            <div className="not-italic font-mono text-xs text-ink-3">
              {node.citation.chunk_id} · p.{node.citation.page} · bbox{" "}
              {node.citation.bbox.map((n) => n.toFixed(2)).join(",")}
            </div>
          </blockquote>
        )}

        <div className="mt-2 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-ink-3">
              ← sources ({sourceLabels.length})
            </div>
            <div className="mt-1 text-ink-2">
              {sourceLabels.length === 0
                ? "(leaf — sourced from document or external)"
                : sourceLabels.join(", ")}
            </div>
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-ink-3">
              → consumed by ({consumerLabels.length})
            </div>
            <div className="mt-1 text-ink-2">
              {consumerLabels.length === 0
                ? "(terminal — feeds the final decision)"
                : consumerLabels.join(", ")}
            </div>
          </div>
        </div>
      </a>
    </article>
  );
};
