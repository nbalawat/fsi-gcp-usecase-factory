import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { GateState } from "../lib/data";

const statusBadge = (
  s: GateState["status"],
): "success" | "warning" | "neutral" => {
  if (s === "completed") return "success";
  if (s === "pending") return "warning";
  return "neutral";
};

const statusLabel: Record<GateState["status"], string> = {
  completed: "decided",
  pending: "awaiting",
  queued: "queued",
};

const dispositionBadge = (
  d?: string,
): "success" | "warning" | "danger" | "neutral" => {
  if (d === "approve") return "success";
  if (d === "return") return "warning";
  if (d === "reject" || d === "decline") return "danger";
  return "neutral";
};

export interface GateLedgerProps {
  gates: GateState[];
  /** Build the per-gate response URL */
  buildHref: (gateId: string) => string;
}

/**
 * Right-rail summary of the four HITL gates as a tight ledger. Each row
 * shows: gate label · current status · disposition (if decided) · jump
 * link. Mirrors what the transcript shows in chronological form — but
 * here the user can hit any gate in one click. Acts as the table of
 * contents for the transcript.
 */
export const GateLedger: React.FC<GateLedgerProps> = ({ gates, buildHref }) => (
  <section
    aria-label="Human-in-the-loop ledger"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="border-b border-rule px-3 py-2">
      <div className="eyebrow">Human gates</div>
      <h3 className="text-h4 font-semi text-ink-1">HITL ledger</h3>
    </header>
    <ul className="flex flex-col">
      {gates.map((g) => (
        <li
          key={g.id}
          className="flex flex-col gap-1 border-b border-rule px-3 py-2.5 last:border-b-0"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-ui font-medium text-ink-1">{g.label}</span>
            <StatusBadge kind={statusBadge(g.status)}>
              {statusLabel[g.status]}
            </StatusBadge>
          </div>
          <div className="flex items-center justify-between gap-2">
            {g.decision ? (
              <StatusBadge kind={dispositionBadge(g.decision)}>
                {g.decision}
              </StatusBadge>
            ) : (
              <span className="font-mono text-mono-sm text-ink-3">
                {g.status === "pending" ? "decision required" : "—"}
              </span>
            )}
            <a
              href={buildHref(g.id)}
              className="font-mono text-mono-sm text-accent-pressed hover:underline"
            >
              Open →
            </a>
          </div>
          {g.decidedAt && (
            <span className="font-mono text-mono-sm text-ink-3">
              decided {g.decidedAt.substring(11, 19)} UTC
            </span>
          )}
        </li>
      ))}
    </ul>
  </section>
);
