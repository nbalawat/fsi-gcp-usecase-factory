"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { CounterpartyGraph as Graph, GraphEdge, GraphNode } from "../lib/data";

export interface CounterpartyGraphProps {
  graph: Graph;
  selectedEdgeIdx: ReadonlySet<number>;
  selectedNodeId?: string;
  onToggleEdge: (idx: number) => void;
  onSelectNode: (id: string) => void;
}

// SVG canvas dimensions — fixed so layout is deterministic.
const SVG_W = 720;
const SVG_H = 460;
const CENTER_X = SVG_W / 2;
const CENTER_Y = SVG_H / 2;
const RING_R = 170;

const nodeFill: Record<GraphNode["kind"], string> = {
  subject: "#0F0B0B",
  counterparty: "#E8F3D0",
  agent: "#E2EBF8",
  external: "#F4F4F2",
};
const nodeStroke: Record<GraphNode["kind"], string> = {
  subject: "#0F0B0B",
  counterparty: "#5F8718",
  agent: "#3367C9",
  external: "#B5AFA6",
};
const nodeText: Record<GraphNode["kind"], string> = {
  subject: "#FFFFFF",
  counterparty: "#0F0B0B",
  agent: "#0F0B0B",
  external: "#2C2520",
};

const edgeColor: Record<GraphEdge["kind"], string> = {
  "wire-out": "#C13838",
  "wire-in": "#3D8B3D",
  aggregate: "#B07A00",
  "peer-link": "#3367C9",
  "agent-finding": "#3367C9",
  "system-event": "#A39A91",
};

const signalLabel: Record<string, string> = {
  structuring: "structuring",
  velocity: "velocity",
  geo: "geo-risk",
};

/**
 * Pure-SVG counterparty graph. The subject sits at the center; every
 * other node is placed on a deterministic ring (golden-angle distribution
 * for visual stability). Edges fan out from the subject.
 *
 * Interactivity:
 *   - Click a node → select it (drills into the right rail).
 *   - Click an edge → toggle membership in the SAR sub-graph selection.
 *
 * The graph itself is read-only: no edge is invented, no party is
 * computed. Every edge corresponds to one PIPELINE_EVENT (by idx).
 *
 * Client component because edge selection is interactive. The auditor
 * requires interactive elements to have onClick; here every <circle>
 * and <line> that has an affordance gets one.
 */
export const CounterpartyGraph: React.FC<CounterpartyGraphProps> = ({
  graph,
  selectedEdgeIdx,
  selectedNodeId,
  onToggleEdge,
  onSelectNode,
}) => {
  // Deterministic layout: subject at center, others on a ring.
  const layout = React.useMemo(() => {
    const others = graph.nodes.filter((n) => n.kind !== "subject");
    const positions = new Map<string, { x: number; y: number }>();
    positions.set(graph.subject.id, { x: CENTER_X, y: CENTER_Y });
    const step = (Math.PI * 2) / Math.max(1, others.length);
    // Start angle offset so first node sits "north-east" not due east.
    const start = -Math.PI / 2 + 0.35;
    others.forEach((n, i) => {
      const a = start + i * step;
      positions.set(n.id, {
        x: CENTER_X + RING_R * Math.cos(a),
        y: CENTER_Y + RING_R * Math.sin(a),
      });
    });
    return positions;
  }, [graph]);

  // Group edges by counterparty so multi-edges fan out as parallel arcs.
  const edgesByPair = React.useMemo(() => {
    const m = new Map<string, GraphEdge[]>();
    for (const e of graph.edges) {
      const k = e.from === e.to ? `self:${e.from}` : `${e.from}→${e.to}`;
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    return m;
  }, [graph.edges]);

  return (
    <figure
      aria-label="Counterparty graph"
      className="overflow-hidden rounded-md border border-rule bg-paper-2"
    >
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Subject and counterparties; click edges to add to SAR narrative."
      >
        {/* Ring guide (decorative) */}
        <circle
          cx={CENTER_X}
          cy={CENTER_Y}
          r={RING_R}
          fill="none"
          stroke="#E3E0DA"
          strokeDasharray="2 4"
        />
        {/* Edges */}
        {Array.from(edgesByPair.entries()).map(([key, group]) =>
          group.map((e, i) => {
            const isSelf = e.from === e.to;
            const from = layout.get(e.from)!;
            const to = layout.get(e.to)!;
            const selected = selectedEdgeIdx.has(e.idx);
            const stroke = edgeColor[e.kind];
            const sw = selected ? 3 : 1.5;
            const opacity = selected ? 1 : e.kind === "system-event" ? 0.35 : 0.7;

            // Self-loop on subject: a small loop above the node.
            if (isSelf) {
              const cx = from.x;
              const cy = from.y - 38 - i * 6;
              return (
                <g key={`${key}-${e.idx}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={6 + i}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={sw}
                    opacity={opacity}
                    role="button"
                    tabIndex={0}
                    aria-label={`Self-loop event ${e.label}`}
                    onClick={() => onToggleEdge(e.idx)}
                    style={{ cursor: "pointer" }}
                  />
                </g>
              );
            }

            // Fan parallel edges between the same pair on slight curves.
            const offset = (i - (group.length - 1) / 2) * 14;
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const nx = -dy / len;
            const ny = dx / len;
            const cx = mx + nx * offset;
            const cy = my + ny * offset;

            const path = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;

            return (
              <g key={`${key}-${e.idx}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={sw}
                  opacity={opacity}
                  strokeDasharray={e.kind === "agent-finding" ? "4 3" : undefined}
                />
                {/* Hit target (transparent fat path) so the edge is clickable */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edge: ${e.label}${selected ? " (selected)" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onToggleEdge(e.idx)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onToggleEdge(e.idx);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                />
                {e.signal && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect
                      x={cx - 30}
                      y={cy - 9}
                      width={60}
                      height={18}
                      rx={4}
                      fill="#FFFFFF"
                      stroke={stroke}
                      strokeWidth={0.75}
                      opacity={0.95}
                    />
                    <text
                      x={cx}
                      y={cy + 4}
                      textAnchor="middle"
                      fontSize={10}
                      fontFamily="JetBrains Mono, ui-monospace, monospace"
                      fill={stroke}
                    >
                      {signalLabel[e.signal] ?? e.signal}
                    </text>
                  </g>
                )}
              </g>
            );
          }),
        )}

        {/* Nodes */}
        {graph.nodes.map((n) => {
          const p = layout.get(n.id)!;
          const isSubject = n.kind === "subject";
          const r = isSubject ? 32 : 22;
          const isSelected = selectedNodeId === n.id;
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`Node ${n.label}`}
              aria-pressed={isSelected}
              onClick={() => onSelectNode(n.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onSelectNode(n.id);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={r + (isSelected ? 4 : 0)}
                fill={nodeFill[n.kind]}
                stroke={nodeStroke[n.kind]}
                strokeWidth={isSelected ? 3 : 1.5}
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fontSize={isSubject ? 12 : 10}
                fontFamily="Inter Tight, system-ui, sans-serif"
                fontWeight={isSubject ? 600 : 500}
                fill={nodeText[n.kind]}
                style={{ pointerEvents: "none" }}
              >
                {abbr(n.label, isSubject ? 14 : 10)}
              </text>
              {!isSubject && (
                <text
                  x={p.x}
                  y={p.y + r + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="JetBrains Mono, ui-monospace, monospace"
                  fill="#665D55"
                  style={{ pointerEvents: "none" }}
                >
                  {n.kind}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-3 border-t border-rule bg-paper px-4 py-2 text-mono-sm font-mono text-ink-3">
        <LegendDot color="#0F0B0B" label="subject" />
        <LegendDot color="#5F8718" label="counterparty" />
        <LegendDot color="#3367C9" label="agent" />
        <span className="text-ink-4">·</span>
        <LegendLine color="#C13838" label="wire" />
        <LegendLine color="#B07A00" label="aggregate" />
        <LegendLine color="#3367C9" label="agent finding" dashed />
        <span className="ml-auto flex items-center gap-2">
          <StatusBadge kind="info">
            {selectedEdgeIdx.size} edge{selectedEdgeIdx.size === 1 ? "" : "s"} selected
          </StatusBadge>
        </span>
      </figcaption>
    </figure>
  );
};

function abbr(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(1, n - 1)) + "…";
}

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: color }}
    />
    {label}
  </span>
);

const LegendLine: React.FC<{ color: string; label: string; dashed?: boolean }> = ({
  color,
  label,
  dashed,
}) => (
  <span className="inline-flex items-center gap-1.5">
    <span
      aria-hidden
      className="inline-block h-0.5 w-5"
      style={{
        backgroundColor: dashed ? "transparent" : color,
        borderTop: dashed ? `1.5px dashed ${color}` : undefined,
      }}
    />
    {label}
  </span>
);
