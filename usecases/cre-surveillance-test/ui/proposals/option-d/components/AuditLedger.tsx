import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { LedgerRow } from "../lib/data";
import { ledgerKindLabel } from "../lib/data";
import { CitationChain } from "./CitationChain";

export interface AuditLedgerProps {
  rows: readonly LedgerRow[];
}

const kindBadge = (
  k: LedgerRow["kind"],
): "success" | "warning" | "danger" | "info" | "neutral" | "accent" => {
  switch (k) {
    case "hitl_pending":
      return "warning";
    case "hitl_decided":
      return "success";
    case "agent_reasoning":
      return "accent";
    case "service_call":
    case "extraction":
      return "info";
    case "intake":
      return "neutral";
    default:
      return "neutral";
  }
};

const formatTime = (iso: string): string => {
  // Hand-rolled formatter per ui-standards.md §4.12 — UTC, sortable.
  // Display as "YYYY-MM-DD HH:MM:SS Z" — exam-report style.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
};

/**
 * Audit ledger — the page-format version of the event spine. Every row
 * is one entry in the "supervisory exam log": timestamp · kind · headline
 * · citation chain. An OCC examiner can read this top-to-bottom and
 * prove every action.
 *
 * Server component.
 */
export const AuditLedger: React.FC<AuditLedgerProps> = ({ rows }) => (
  <section
    aria-label="Audit ledger"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
      <div>
        <div className="eyebrow">Supervisory exam log</div>
        <h3 className="font-serif text-h3 font-semi text-ink-1">
          Complete chain of custody
        </h3>
      </div>
      <span className="font-mono text-mono-sm text-ink-3">
        {rows.length} entr{rows.length === 1 ? "y" : "ies"}
      </span>
    </header>
    <ol className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.idx}
          className="flex flex-col gap-1.5 border-b border-rule px-4 py-3 last:border-b-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-mono-sm text-ink-3">
                {String(row.idx + 1).padStart(2, "0")}
              </span>
              <span className="font-mono text-mono-sm text-ink-3">
                {formatTime(row.at)}
              </span>
              <StatusBadge kind={kindBadge(row.kind)}>
                {ledgerKindLabel(row.kind)}
              </StatusBadge>
              {row.decision && (
                <span className="font-mono text-mono-sm font-medium text-ink-1">
                  → {row.decision}
                </span>
              )}
            </div>
            {row.artifact && (
              <span className="font-mono text-mono-sm text-ink-3">
                artifact: {row.artifact}
              </span>
            )}
          </div>
          <div className="text-ui text-ink-1">{row.headline}</div>
          {row.detail && (
            <div className="text-body-sm text-ink-3">{row.detail}</div>
          )}
          {row.citations.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="eyebrow">Cited</span>
              <CitationChain citations={row.citations} />
            </div>
          )}
        </li>
      ))}
    </ol>
  </section>
);
