import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { AuditRow } from "../lib/data";

const actorBadge: Record<AuditRow["actor"], "success" | "warning" | "info" | "neutral"> = {
  system: "neutral",
  service: "info",
  agent: "info",
  human: "success",
  gate: "warning",
};

const actorLabel: Record<AuditRow["actor"], string> = {
  system: "sys",
  service: "svc",
  agent: "agt",
  human: "hum",
  gate: "gate",
};

export interface AuditLedgerProps {
  rows: AuditRow[];
  /** Set of edge indices currently in the SAR sub-graph selection */
  selectedEdgeIdx: ReadonlySet<number>;
  /** Toggle one row's edge in/out of the selection (only edge-linked rows) */
  onToggleEdge: (idx: number) => void;
}

/**
 * Right-rail audit ledger. One row per PIPELINE_EVENT — the full
 * audit trail required for SAR compliance. Edge-linked rows have an
 * inline checkbox that toggles them in the graph selection.
 */
export const AuditLedger: React.FC<AuditLedgerProps> = ({
  rows,
  selectedEdgeIdx,
  onToggleEdge,
}) => (
  <section
    aria-label="Audit ledger"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="border-b border-rule px-3 py-2">
      <div className="eyebrow">Audit ledger</div>
      <h3 className="text-h4 font-semi text-ink-1">
        Every event, in order
      </h3>
      <p className="font-mono text-mono-sm text-ink-3">
        {rows.length} entries · examiner-ready
      </p>
    </header>
    <ol className="flex max-h-96 flex-col overflow-y-auto">
      {rows.map((r) => {
        const inSelection = r.edgeIdx !== undefined && selectedEdgeIdx.has(r.edgeIdx);
        return (
          <li
            key={r.idx}
            data-row-idx={r.idx}
            data-actor={r.actor}
            className="flex flex-col gap-1 border-b border-rule px-3 py-2 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-mono-sm tabular-nums text-ink-3">
                {r.at.substring(11, 19)}
              </span>
              <StatusBadge kind={actorBadge[r.actor]}>
                {actorLabel[r.actor]}
              </StatusBadge>
            </div>
            <div className="text-ui text-ink-1">{r.headline}</div>
            <div className="font-mono text-mono-sm text-ink-3">
              {r.speaker}
            </div>
            {r.detail && (
              <div className="font-mono text-mono-sm text-ink-3">{r.detail}</div>
            )}
            {r.decision && (
              <StatusBadge
                kind={r.decision === "approve" ? "success" : "neutral"}
              >
                {r.decision}
              </StatusBadge>
            )}
            {r.edgeIdx !== undefined && r.actor !== "system" && (
              <label className="mt-0.5 flex items-center gap-2 font-mono text-mono-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={inSelection}
                  onChange={() => onToggleEdge(r.edgeIdx!)}
                  aria-label={`Toggle event ${r.idx} in SAR narrative`}
                  className="h-3.5 w-3.5 rounded-sm"
                />
                {inSelection ? "in narrative" : "exclude"}
              </label>
            )}
          </li>
        );
      })}
    </ol>
  </section>
);
