"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { GateState } from "../lib/data";

export interface GatePillRowProps {
  gates: GateState[];
  /** When the row is in "navigate" mode (case page), each pill links
   *  to /approval/<caseId>?gate=<id>. */
  buildHref?: (gateId: string) => string;
  /** When the row is in "select" mode (approval page), the active
   *  gate is highlighted and clicks call onSelect. */
  activeGate?: string;
  onSelect?: (gateId: string) => void;
}

/**
 * The four HITL gates as a compressed pill row.
 *
 * Sparse-executive density: one row, four pills, status colour-coded,
 * no labels beyond the gate name and the disposition badge. The exec
 * sees in one glance which gates are decided and which still need
 * attention.
 *
 * Two modes share one shape — `buildHref` mode renders `<a>` anchors
 * (case page → approval page); `onSelect` mode renders client-side
 * tabs (approval page). Mutually exclusive — never set both.
 */
export const GatePillRow: React.FC<GatePillRowProps> = ({
  gates,
  buildHref,
  activeGate,
  onSelect,
}) => {
  return (
    <div
      role={onSelect ? "tablist" : "list"}
      aria-label="HITL gates"
      className="flex flex-wrap items-center gap-2"
    >
      {gates.map((g) => {
        const badgeKind =
          g.status === "completed"
            ? "success"
            : g.status === "pending"
              ? "warning"
              : "neutral";
        const verb =
          g.status === "completed" ? g.decision ?? "decided" : g.status;
        const isActive = g.id === activeGate;

        const content = (
          <>
            <span className="font-mono text-sm text-ink-1">{g.label}</span>
            <StatusBadge kind={badgeKind}>{verb}</StatusBadge>
          </>
        );

        const sharedClass = [
          "flex items-center gap-2 rounded-sm border px-3 py-1.5 transition",
          isActive
            ? "border-accent bg-accent-tint"
            : "border-rule bg-paper hover:bg-paper-2",
        ].join(" ");

        if (onSelect) {
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(g.id)}
              className={sharedClass}
            >
              {content}
            </button>
          );
        }
        if (buildHref) {
          return (
            <a key={g.id} href={buildHref(g.id)} className={sharedClass}>
              {content}
            </a>
          );
        }
        return (
          <div key={g.id} role="listitem" className={sharedClass}>
            {content}
          </div>
        );
      })}
    </div>
  );
};
