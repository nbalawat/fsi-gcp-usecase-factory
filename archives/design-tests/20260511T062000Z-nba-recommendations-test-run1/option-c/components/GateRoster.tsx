import * as React from "react";
import { StatusBadge } from "@primitives";

export interface GateRosterItem {
  name: string;
  irrevocable: boolean;
  description: string;
}

export interface GateRosterProps {
  gates: readonly GateRosterItem[];
  approvalHref: string;
}

const GATE_LABEL: Record<string, string> = {
  rm_disposition: "RM disposition",
  rm_send_to_customer: "Send to customer",
};

/**
 * Compact roster of HITL gates. Reversible gates show the disposition
 * lives in the queue; the irrevocable gate links into /approval/[id]
 * with the ApprovalGate primitive.
 */
export const GateRoster: React.FC<GateRosterProps> = ({
  gates,
  approvalHref,
}) => (
  <section
    aria-label="Human-in-the-loop gates"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="border-b border-rule px-4 py-3">
      <div className="eyebrow">HITL gates</div>
      <h2 className="font-serif text-h3 font-semi text-ink-1">
        Where humans sit in the loop
      </h2>
    </header>
    <ul className="flex flex-col">
      {gates.map((g) => (
        <li
          key={g.name}
          className="flex flex-col gap-2 border-b border-rule px-4 py-3 last:border-b-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semi text-ui text-ink-1">
                {GATE_LABEL[g.name] ?? g.name}
              </span>
              <StatusBadge kind={g.irrevocable ? "danger" : "neutral"}>
                {g.irrevocable ? "irrevocable" : "reversible"}
              </StatusBadge>
            </div>
            {g.irrevocable ? (
              <a
                href={approvalHref}
                className="rounded-sm bg-brandBlack px-3 py-1.5 font-mono text-mono-sm font-semi text-brandBlack-fg hover:bg-ink-2"
              >
                Open approval flow →
              </a>
            ) : (
              <span className="font-mono text-mono-sm text-ink-3">
                Inline on every queue row
              </span>
            )}
          </div>
          <p className="text-mono-sm text-ink-2">{g.description}</p>
        </li>
      ))}
    </ul>
  </section>
);
