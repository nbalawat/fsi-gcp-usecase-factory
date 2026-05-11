"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { GatePillRow } from "./GatePillRow";
import type { GateState } from "../lib/data";

export interface GateApprovalClientProps {
  caseId: string;
  gates: GateState[];
  /** Pre-shaped recommendations per gate — never computed in components. */
  recommendations: Record<string, ApprovalRecommendation>;
  /** Initial gate (from ?gate=… or first pending). */
  initialGate: string;
}

/**
 * The approval flow, sparse-executive style.
 *
 * One <ApprovalGate> primitive at full width is the page. The gate
 * pill-row floats above it as a stepper — pick a gate, the gate's
 * recommendation card swaps in. There is no transcript, no
 * before-and-after panel, no second column. The page asks ONE
 * question — "approve this?" — and the exec answers.
 */
export const GateApprovalClient: React.FC<GateApprovalClientProps> = ({
  caseId,
  gates,
  recommendations,
  initialGate,
}) => {
  const [activeGate, setActiveGate] = React.useState<string>(initialGate);
  const [posted, setPosted] = React.useState<
    Record<string, { disposition: string; comment?: string }>
  >({});

  const active = gates.find((g) => g.id === activeGate) ?? gates[0];
  if (!active) {
    return (
      <p className="px-6 py-10 text-ink-3">
        No gates configured for this case.
      </p>
    );
  }
  const rec = recommendations[active.id] ?? {
    decision: "RETURN_FOR_REVISION",
    rationaleSummary:
      "Recommendation not yet generated for this gate.",
  };

  const accept = (id: string): void => {
    setPosted((p) => ({ ...p, [active.id]: { disposition: "accepted" } }));
    // eslint-disable-next-line no-console
    console.info("[option-a] accept", { case: id, gate: active.id });
  };
  const edit = (id: string, comment: string): void => {
    setPosted((p) => ({
      ...p,
      [active.id]: { disposition: "returned", comment },
    }));
    // eslint-disable-next-line no-console
    console.info("[option-a] return", { case: id, gate: active.id, comment });
  };
  const reject = (id: string, comment: string): void => {
    setPosted((p) => ({
      ...p,
      [active.id]: { disposition: "rejected", comment },
    }));
    // eslint-disable-next-line no-console
    console.info("[option-a] reject", { case: id, gate: active.id, comment });
  };

  const postedDisp = posted[active.id];

  return (
    <div className="flex flex-col gap-6">
      {/* Stepper — four pills, exec picks which gate to sign off. */}
      <GatePillRow
        gates={gates}
        activeGate={active.id}
        onSelect={setActiveGate}
      />

      {/* The active gate — one big card, the only thing on the page. */}
      {active.status === "completed" ? (
        <section
          aria-label="Gate already decided"
          className="rounded-md border border-rule bg-paper p-8"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl font-semibold text-ink-1">
              {active.label} review
            </h2>
            <StatusBadge
              kind={active.decision === "approve" ? "success" : "neutral"}
            >
              {active.decision ?? "decided"}
            </StatusBadge>
          </div>
          <p className="mt-4 max-w-3xl font-serif text-base text-ink-2">
            This gate has been disposed of. Reopen requires a new review
            event in the workflow.
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-wider text-ink-3">
            decided at {active.decidedAt ?? "—"}
          </p>
        </section>
      ) : postedDisp ? (
        <section
          aria-label="Disposition posted"
          className="rounded-md border border-semantic-success bg-semantic-successTint p-8"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl font-semibold text-ink-1">
              {active.label} → {postedDisp.disposition}
            </h2>
            <StatusBadge kind="success">posted</StatusBadge>
          </div>
          {postedDisp.comment && (
            <p className="mt-4 max-w-3xl text-ink-2">
              <span className="font-mono text-xs uppercase tracking-wider text-ink-3 mr-2">
                comment
              </span>
              {postedDisp.comment}
            </p>
          )}
          <p className="mt-4 font-mono text-xs text-ink-3">
            Workflow will confirm on case {caseId}.
          </p>
        </section>
      ) : (
        <ApprovalGate
          caseId={caseId}
          recommendation={rec}
          onAccept={accept}
          onEdit={edit}
          onReject={reject}
        />
      )}
    </div>
  );
};
