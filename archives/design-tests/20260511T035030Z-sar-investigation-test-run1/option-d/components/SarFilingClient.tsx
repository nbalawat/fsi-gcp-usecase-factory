"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { CounterpartyGraph } from "./CounterpartyGraph";
import { NarrativeDraft } from "./NarrativeDraft";
import {
  buildNarrative,
  defaultSelection,
  toCounterpartyGraph,
  type GateState,
} from "../lib/data";

interface RawEvt {
  at: string;
  kind: string;
  stage?: string;
  doc_type?: string;
  service?: string;
  agent?: string;
  gate?: string;
  decision?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  confidence?: number;
}

export interface SarFilingClientProps {
  caseId: string;
  borrowerName: string;
  events: readonly RawEvt[];
  /** SAR-investigation has a single gate (final_approval). */
  gate: GateState;
  /** Pre-shaped recommendation — components/auditor rule forbids
   *  decision math here, so the recommendation is built by the
   *  page and passed in. */
  recommendation: ApprovalRecommendation;
}

/**
 * Approval flow rendered AS the graph metaphor. The BSA officer sees:
 *   1. The same counterparty graph from the case detail (frozen for review).
 *   2. The same narrative draft that filing produces.
 *   3. The ApprovalGate primitive inline — APPROVE files the SAR,
 *      RETURN sends back for more investigation, REJECT dismisses
 *      the alert.
 *
 * Wildcard freedom: there is no "review the SAR form, then click
 * approve" hop — the form IS the sub-graph; you sign off on the
 * sub-graph.
 */
export const SarFilingClient: React.FC<SarFilingClientProps> = ({
  caseId,
  borrowerName,
  events,
  gate,
  recommendation,
}) => {
  const graph = React.useMemo(
    () => toCounterpartyGraph(caseId, borrowerName, events),
    [caseId, borrowerName, events],
  );
  const defaultSel = React.useMemo(() => defaultSelection(graph), [graph]);

  const [selectedEdgeIdx, setSelectedEdgeIdx] = React.useState<Set<number>>(
    () => new Set(defaultSel),
  );
  const [selectedNodeId, setSelectedNodeId] = React.useState<string>(
    graph.subject.id,
  );
  const [posted, setPosted] = React.useState<
    { disposition: string; comment?: string } | null
  >(null);

  const toggleEdge = React.useCallback((idx: number): void => {
    setSelectedEdgeIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const selectNode = React.useCallback((id: string): void => {
    setSelectedNodeId(id);
  }, []);

  const narrative = React.useMemo(
    () => buildNarrative(graph, selectedEdgeIdx, borrowerName),
    [graph, selectedEdgeIdx, borrowerName],
  );

  const accept = (id: string): void => {
    setPosted({ disposition: "filed" });
    // eslint-disable-next-line no-console
    console.info("[option-d] file SAR", {
      case: id,
      gate: gate.id,
      edges: Array.from(selectedEdgeIdx),
    });
  };
  const edit = (id: string, comment: string): void => {
    setPosted({ disposition: "returned for more investigation", comment });
    // eslint-disable-next-line no-console
    console.info("[option-d] return SAR", { case: id, gate: gate.id, comment });
  };
  const reject = (id: string, comment: string): void => {
    setPosted({ disposition: "alert dismissed", comment });
    // eslint-disable-next-line no-console
    console.info("[option-d] dismiss SAR", { case: id, gate: gate.id, comment });
  };

  const decided = gate.status === "completed";

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="SAR sub-graph (filing scope)"
        className="rounded-md border border-rule bg-paper"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
          <div>
            <div className="eyebrow">SAR filing scope</div>
            <h2 className="font-serif text-h3 font-semi text-ink-1">
              Selected sub-graph — what gets filed
            </h2>
            <p className="mt-1 text-caption text-ink-3">
              Read the selection; toggle edges off if they shouldn't be in
              the filing. The narrative below regenerates from the
              selection in real time.
            </p>
          </div>
          <StatusBadge kind="info">
            {selectedEdgeIdx.size} / {graph.edges.length} edges in filing
          </StatusBadge>
        </header>
        <div className="px-4 py-3">
          <CounterpartyGraph
            graph={graph}
            selectedEdgeIdx={selectedEdgeIdx}
            selectedNodeId={selectedNodeId}
            onToggleEdge={toggleEdge}
            onSelectNode={selectNode}
          />
        </div>
      </section>

      <NarrativeDraft
        blocks={narrative}
        selectionCount={selectedEdgeIdx.size}
        defaultCount={defaultSel.size}
      />

      {/* The signoff — inline at the bottom of the filing scope. */}
      {decided ? (
        <section
          aria-label="Gate already decided"
          className="rounded-md border border-rule bg-paper p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="eyebrow">Already decided</div>
              <h3 className="text-h4 font-semi text-ink-1">{gate.label}</h3>
            </div>
            <StatusBadge
              kind={gate.decision === "approve" ? "success" : "neutral"}
            >
              {gate.decision ?? "decided"}
            </StatusBadge>
          </div>
          <p className="mt-2 text-caption text-ink-3">
            Disposition recorded {gate.decidedAt ?? ""}. Reopen requires a
            new review event.
          </p>
        </section>
      ) : posted ? (
        <section
          aria-label="Disposition posted"
          className="rounded-md border border-semantic-success bg-semantic-success-tint p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-h4 font-semi text-ink-1">
              {gate.label} → {posted.disposition}
            </h3>
            <StatusBadge kind="success">posted</StatusBadge>
          </div>
          {posted.comment && (
            <p className="mt-2 text-ui text-ink-2">
              <span className="eyebrow mr-2">comment</span>
              {posted.comment}
            </p>
          )}
          <p className="mt-2 font-mono text-mono-sm text-ink-3">
            A new audit-ledger row will appear on case {caseId} once the
            workflow confirms.
          </p>
        </section>
      ) : (
        <ApprovalGate
          caseId={caseId}
          recommendation={recommendation}
          onAccept={accept}
          onEdit={edit}
          onReject={reject}
        />
      )}
    </div>
  );
};
