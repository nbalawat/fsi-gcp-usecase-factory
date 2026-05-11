"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import { DeclineReasonActions } from "./DeclineReasonActions";
import {
  DECLINE_REASONS,
  type DeclineReason,
  type DeclineRow,
  type TuneActionKind,
} from "../lib/data";

export interface CaseDispositionProps {
  decline: DeclineRow;
}

interface ActionRecord {
  reasonId: string;
  kind: TuneActionKind;
  at: string;
}

/**
 * Single-transaction disposition surface. Renders ONE
 * `DeclineReasonActions` per decline reason on the case — each with its
 * own inline action set. As the analyst clicks, a local audit log
 * captures the queued tunes.
 *
 * Decision: the case page itself shows the full reason explanation
 * (compact=false); the bulk stream uses compact=true.
 */
export const CaseDisposition: React.FC<CaseDispositionProps> = ({ decline }) => {
  const [disposed, setDisposed] = React.useState<
    Partial<Record<string, TuneActionKind>>
  >({});
  const [log, setLog] = React.useState<ActionRecord[]>([]);

  const onAction = React.useCallback(
    (kind: TuneActionKind, reason: DeclineReason) => {
      setDisposed((prev) => ({ ...prev, [reason.id]: kind }));
      setLog((prev) =>
        [
          { reasonId: reason.id, kind, at: new Date().toISOString() },
          ...prev,
        ].slice(0, 12),
      );
    },
    [],
  );

  return (
    <section
      aria-label="Decline disposition"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
            Decline reasons
          </div>
          <h2 className="font-serif text-xl font-semibold text-ink-1">
            Why this transaction was {decline.disposition}
          </h2>
        </div>
        <StatusBadge
          kind={decline.disposition === "decline" ? "danger" : "warning"}
        >
          {decline.reasonIds.length} reason
          {decline.reasonIds.length === 1 ? "" : "s"}
        </StatusBadge>
      </header>
      <div className="flex flex-col gap-3 px-4 py-4">
        {decline.reasonIds.map((rid) => {
          const reason = DECLINE_REASONS[rid];
          return (
            <DeclineReasonActions
              key={rid}
              reason={reason}
              disposed={disposed[rid]}
              onAction={onAction}
            />
          );
        })}
      </div>
      {log.length > 0 && (
        <footer className="border-t border-rule bg-paper-2 px-4 py-2">
          <div className="text-xs font-medium uppercase tracking-wider text-ink-3 mb-1">
            Queued tunes ({log.length})
          </div>
          <ol className="flex flex-col gap-1">
            {log.map((e, i) => (
              <li
                key={`${e.reasonId}-${i}`}
                className="flex flex-wrap items-baseline gap-2 font-mono text-mono-sm"
              >
                <span className="tabular-nums text-ink-3">
                  {e.at.substring(11, 19)}
                </span>
                <span className="text-ink-1">{labelOf(e.kind)}</span>
                <span className="text-ink-3">on {e.reasonId}</span>
              </li>
            ))}
          </ol>
        </footer>
      )}
    </section>
  );
};

function labelOf(kind: TuneActionKind): string {
  switch (kind) {
    case "override_for_customer":
      return "Override (customer)";
    case "add_to_allowlist":
      return "Allowlist (merchant)";
    case "tune_threshold":
      return "Threshold tune";
    case "step_up_for_review":
      return "Step-up";
  }
}
