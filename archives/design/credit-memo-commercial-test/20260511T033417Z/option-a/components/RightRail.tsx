"use client";

import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@fsi-bank/components";
import type { GateStatus } from "../lib/data";

export interface RightRailProps {
  caseId: string;
  gates: GateStatus[];
  goApprovalHref: string;
}

const stateKind = (
  state: GateStatus["state"],
): "success" | "warning" | "neutral" => {
  if (state === "decided") return "success";
  if (state === "pending") return "warning";
  return "neutral";
};

/**
 * The tiny right-rail. 240px wide. Just the four HITL gates with their
 * present status. Click "Go to approval" → /approval/[id]. No counts,
 * no charts. The page is the artifact; this is the navigator.
 */
export const RightRail: React.FC<RightRailProps> = ({
  caseId,
  gates,
  goApprovalHref,
}) => (
  <aside
    aria-label="Case rail"
    className="hidden w-60 shrink-0 border-l border-rule bg-paper-2 px-4 py-6 lg:block"
  >
    <div className="eyebrow text-ink-3">HITL gates</div>
    <ul className="mt-3 flex flex-col gap-3">
      {gates.map((g) => (
        <li key={g.gate} className="flex items-center justify-between gap-2">
          <span className="font-mono text-mono-sm text-ink-1 truncate">
            {g.gate.replace(/_/g, " ")}
          </span>
          <StatusBadge kind={stateKind(g.state)}>
            {g.state === "decided" ? (g.decision ?? "done") : g.state}
          </StatusBadge>
        </li>
      ))}
    </ul>
    <Link
      href={goApprovalHref}
      className="mt-6 block rounded-sm border border-accent bg-accent px-3 py-2 text-center text-mono-sm font-mono font-medium text-paper hover:bg-accent-pressed"
    >
      Open approval flow →
    </Link>
    <div className="mt-6 font-mono text-mono-sm text-ink-3">
      Case <span className="text-ink-2">{caseId}</span>
    </div>
  </aside>
);
