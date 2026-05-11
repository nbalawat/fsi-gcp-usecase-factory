import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { GateState } from "../lib/data";

export interface GateRosterProps {
  gates: readonly GateState[];
  /** Render an "open" link per gate when provided. */
  buildHref?: (gateId: string) => string;
  /** Highlight a particular gate id. */
  activeId?: string;
}

const statusBadge = (
  s: GateState["status"],
): "success" | "warning" | "neutral" => {
  if (s === "completed") return "success";
  if (s === "pending") return "warning";
  return "neutral";
};

const formatTime = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

/**
 * Compact roster of HITL gates for a facility, with status and an open
 * link. Used on the case page as a sidebar and on the approval page as
 * the gate-picker.
 *
 * Server component.
 */
export const GateRoster: React.FC<GateRosterProps> = ({
  gates,
  buildHref,
  activeId,
}) => (
  <section
    aria-label="HITL gates"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="border-b border-rule px-4 py-3">
      <div className="eyebrow">Human checkpoints</div>
      <h3 className="font-serif text-h3 font-semi text-ink-1">
        Reviewer gates
      </h3>
    </header>
    <ul className="flex flex-col">
      {gates.map((g) => {
        const href = buildHref?.(g.id);
        const isActive = activeId === g.id;
        const inner = (
          <div
            className={[
              "flex flex-col gap-2 border-b border-rule px-4 py-3 last:border-b-0",
              isActive ? "bg-accent-tint" : "",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-ui font-medium text-ink-1">{g.label}</span>
              <StatusBadge kind={statusBadge(g.status)}>{g.status}</StatusBadge>
            </div>
            <div className="font-mono text-mono-sm text-ink-3">
              {g.irrevocable ? "irrevocable · " : "reversible · "}
              {g.status === "completed"
                ? `decided ${g.decision} at ${formatTime(g.decidedAt)}`
                : g.status === "pending"
                  ? "awaiting reviewer"
                  : "queued"}
            </div>
          </div>
        );
        return (
          <li key={g.id}>
            {href ? (
              <a href={href} className="block hover:bg-paper-2">
                {inner}
              </a>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  </section>
);
