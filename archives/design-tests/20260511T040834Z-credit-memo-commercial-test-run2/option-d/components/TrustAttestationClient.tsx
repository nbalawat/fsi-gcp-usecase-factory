"use client";

import * as React from "react";
import {
  ApprovalGate,
  StatusBadge,
  type ApprovalRecommendation,
} from "@fsi-bank/components";
import type {
  GateScope,
  GateState,
  ValueGraph,
  ValueNode,
} from "../lib/data";

export interface TrustAttestationClientProps {
  caseId: string;
  gates: GateState[];
  scopes: Record<string, GateScope>;
  /** Pre-resolved nodes for each gate's scope, in display order */
  scopeNodes: Record<string, ValueNode[]>;
  /** Indexed graph for source/consumer label lookups */
  graph: ValueGraph;
  /** Which gate to start on */
  initialGate: string;
}

/**
 * The approval flow as a TRUST ATTESTATION over the provenance subtree.
 *
 * Left: a vertical tab strip of all four gates with their status.
 * Right: the selected gate's attestation statement, then the subset of
 * value-graph nodes whose provenance the reviewer is signing off on
 * (sorted lowest-confidence first), then the ApprovalGate primitive.
 *
 * Client component because of the gate-selector state and the
 * disposition handlers wired to ApprovalGate.
 */
export const TrustAttestationClient: React.FC<TrustAttestationClientProps> = ({
  caseId,
  gates,
  scopes,
  scopeNodes,
  graph,
  initialGate,
}) => {
  const [selectedGate, setSelectedGate] = React.useState<string>(initialGate);
  const [decisionLog, setDecisionLog] = React.useState<
    Array<{ gate: string; verb: string; at: string }>
  >([]);

  const scope = scopes[selectedGate];
  const nodes = scopeNodes[selectedGate] ?? [];

  // Sort scope nodes by confidence ascending — surface the riskiest
  // values first so the reviewer attests with eyes open.
  const sortedNodes = React.useMemo(() => {
    return [...nodes].sort((a, b) => {
      const ca = a.confidence ?? 1;
      const cb = b.confidence ?? 1;
      return ca - cb;
    });
  }, [nodes]);

  const recommendation: ApprovalRecommendation = scope
    ? {
        decision: scope.recommendation,
        rationaleSummary: scope.rationale,
        approvalAuthority: scope.authority,
        irrevocable: scope.irrevocable,
      }
    : {
        decision: "ACCEPT",
        rationaleSummary: "Gate scope not loaded.",
      };

  const append = (verb: string): void => {
    setDecisionLog((log) => [
      ...log,
      { gate: selectedGate, verb, at: new Date().toISOString() },
    ]);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[16rem_1fr]">
      {/* Left: gate selector */}
      <nav
        aria-label="HITL gates"
        className="rounded-md border border-rule bg-paper"
      >
        <header className="border-b border-rule px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
            Trust attestations
          </div>
          <h2 className="font-serif text-base font-semibold text-ink-1">
            {gates.length} gates
          </h2>
        </header>
        <ul role="tablist" className="flex flex-col">
          {gates.map((g) => {
            const isActive = g.id === selectedGate;
            const kind: "success" | "warning" | "neutral" =
              g.status === "completed"
                ? "success"
                : g.status === "pending"
                  ? "warning"
                  : "neutral";
            return (
              <li key={g.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSelectedGate(g.id)}
                  className={
                    "flex w-full flex-col items-start gap-1 border-b border-rule px-4 py-3 text-left transition-colors last:border-b-0 focus:outline-none focus:ring-2 focus:ring-accent " +
                    (isActive ? "bg-paper-2" : "hover:bg-paper-2")
                  }
                >
                  <div className="flex w-full items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink-1">
                      {g.label}
                    </span>
                    <StatusBadge kind={kind}>
                      {g.status === "completed"
                        ? (g.decision ?? "decided")
                        : g.status}
                    </StatusBadge>
                  </div>
                  <span className="font-mono text-xs text-ink-3">
                    {(scopes[g.id]?.valueIds.length ?? 0)} values in scope
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Right: attestation pane */}
      <section
        aria-label={`Attestation for ${scope?.label ?? "gate"}`}
        className="flex flex-col gap-4"
      >
        {scope && (
          <header className="rounded-md border border-rule bg-paper px-5 py-4">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
              You are attesting to
            </div>
            <h2 className="mt-0.5 font-serif text-xl font-semibold text-ink-1">
              {scope.label}
            </h2>
            <p className="mt-2 text-sm text-ink-2">{scope.attestation}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-ink-3">
              <span>scope: {scope.valueIds.length} values</span>
              <span>·</span>
              <span>authority: {scope.authority}</span>
              {scope.irrevocable && (
                <>
                  <span>·</span>
                  <StatusBadge kind="danger">irrevocable</StatusBadge>
                </>
              )}
            </div>
          </header>
        )}

        <section
          aria-label="Provenance subtree under attestation"
          className="rounded-md border border-rule bg-paper"
        >
          <header className="border-b border-rule px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
              Subtree (lowest-confidence first)
            </div>
            <p className="mt-0.5 text-sm text-ink-2">
              These are the values you are signing off on. Each row shows
              its producer and source citation, if any. Click through to
              the full provenance inspector on the case detail.
            </p>
          </header>
          <ul className="flex flex-col">
            {sortedNodes.length === 0 && (
              <li className="px-4 py-3 text-sm text-ink-3">
                No values resolved for this gate.
              </li>
            )}
            {sortedNodes.map((n) => {
              const conf = n.confidence;
              const tone: "success" | "warning" | "danger" | "neutral" =
                conf === undefined
                  ? "neutral"
                  : conf >= 0.94
                    ? "success"
                    : conf >= 0.9
                      ? "warning"
                      : "danger";
              const consumers = (graph.consumersOf[n.id] ?? []).map(
                (id) => graph.byId[id]?.label ?? id,
              );
              return (
                <li
                  key={n.id}
                  className="flex flex-col gap-1 border-b border-rule px-4 py-3 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-ink-1">
                        {n.label}
                      </span>
                      <span className="ml-2 font-mono text-xs text-ink-3">
                        {n.producer}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-base font-semibold text-ink-1">
                        {n.display}
                      </span>
                      {conf !== undefined && (
                        <StatusBadge kind={tone}>
                          {Math.round(conf * 100)}%
                        </StatusBadge>
                      )}
                    </div>
                  </div>
                  {n.citation && (
                    <blockquote className="border-l-2 border-rule pl-2 text-xs italic text-ink-2">
                      &ldquo;{n.citation.excerpt}&rdquo;
                      <div className="not-italic font-mono text-xs text-ink-3">
                        {n.citation.chunk_id} · p.{n.citation.page} · bbox{" "}
                        {n.citation.bbox.map((x) => x.toFixed(2)).join(",")}
                      </div>
                    </blockquote>
                  )}
                  {consumers.length > 0 && (
                    <div className="font-mono text-xs text-ink-3">
                      → feeds: {consumers.join(", ")}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <ApprovalGate
          caseId={caseId}
          recommendation={recommendation}
          onAccept={() => append("ACCEPT")}
          onEdit={() => append("RETURN_FOR_REVISION")}
          onReject={() => append("REJECT")}
        />

        {decisionLog.length > 0 && (
          <section
            aria-label="Decision log"
            className="rounded-md border border-rule bg-paper-2 px-4 py-3"
          >
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
              Recorded dispositions (this session)
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {decisionLog.map((d, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-2 font-mono text-xs text-ink-2"
                >
                  <span>{d.gate}</span>
                  <span>{d.verb}</span>
                  <span className="text-ink-3">
                    {new Date(d.at).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </div>
  );
};
