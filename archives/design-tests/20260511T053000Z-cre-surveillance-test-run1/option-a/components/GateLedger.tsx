import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@fsi-bank/components";
import type { GateState } from "../lib/data";

/**
 * Sparse human-in-the-loop ledger. One row per declared HITL gate;
 * pending gates show a "Open" link, decided gates show the decision,
 * queued gates are dim. Reversibility surfaces as a badge so the
 * executive sees at a glance whether the action is irrevocable.
 *
 * Server component — no client state, hrefs only.
 */
export function GateLedger({
  facilityId,
  gates,
}: {
  facilityId: string;
  gates: readonly GateState[];
}): React.ReactElement {
  return (
    <section
      aria-label="HITL gates"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="border-b border-rule px-3 py-2">
        <div className="eyebrow">Human-in-the-loop</div>
        <h2 className="text-h4 font-semi text-ink-1">Gate ledger</h2>
      </header>
      <ul className="flex flex-col">
        {gates.map((g) => (
          <li
            key={g.name}
            className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
          >
            <span className="min-w-0">
              <span className="block truncate text-ui font-medium text-ink-1">
                {humanizeGate(g.name)}
              </span>
              <span className="block truncate font-mono text-mono-sm text-ink-3">
                {g.irrevocable ? "irrevocable" : "reversible"}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <StatusBadge kind={statusKind(g)}>{statusLabel(g)}</StatusBadge>
              {g.status === "pending" && (
                <Link
                  href={`/approval/${facilityId}?gate=${g.name}`}
                  className="rounded-sm bg-accent px-2 py-1 font-mono text-mono-sm text-paper hover:bg-accent-hover"
                >
                  Open
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function humanizeGate(n: string): string {
  return n
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusKind(g: GateState): "success" | "warning" | "neutral" {
  if (g.status === "decided") return "success";
  if (g.status === "pending") return "warning";
  return "neutral";
}

function statusLabel(g: GateState): string {
  if (g.status === "decided") return g.decision ? `decided · ${g.decision}` : "decided";
  if (g.status === "pending") return "pending";
  return "queued";
}
