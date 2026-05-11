"use client";

import * as React from "react";
import {
  ApprovalGate,
  StatusBadge,
  type ApprovalRecommendation,
} from "@fsi-bank/components";
import type { GateStatus } from "../lib/data";

export interface ApprovalFlowClientProps {
  caseId: string;
  gates: GateStatus[];
  recommendations: Record<string, ApprovalRecommendation>;
}

const stateKind = (
  s: GateStatus["state"],
): "success" | "warning" | "neutral" => {
  if (s === "decided") return "success";
  if (s === "pending") return "warning";
  return "neutral";
};

/**
 * Approval flow — client island. One ApprovalGate per HITL gate. Decided
 * gates render collapsed status strips; the active gate renders the full
 * ApprovalGate surface from the shared library.
 *
 * Density 1: a single column, max-w-2xl, no side rail. Executive can
 * scroll vertically through the 4 gates in one motion.
 */
export const ApprovalFlowClient: React.FC<ApprovalFlowClientProps> = ({
  caseId,
  gates,
  recommendations,
}) => {
  const [decisions, setDecisions] = React.useState<
    Record<string, { kind: "accept" | "edit" | "reject"; comment?: string }>
  >({});

  const onAccept = (gate: string) => (id: string): void => {
    setDecisions((d) => ({ ...d, [gate]: { kind: "accept" } }));
    // Wired for telemetry; no irrevocable side effect (mock-data demo).
    if (typeof window !== "undefined") {
      window.console.info("[option-a] accept", { gate, caseId: id });
    }
  };
  const onEdit = (gate: string) => (id: string, comment: string): void => {
    setDecisions((d) => ({ ...d, [gate]: { kind: "edit", comment } }));
    if (typeof window !== "undefined") {
      window.console.info("[option-a] return-for-revision", {
        gate,
        caseId: id,
      });
    }
  };
  const onReject = (gate: string) => (id: string, comment: string): void => {
    setDecisions((d) => ({ ...d, [gate]: { kind: "reject", comment } }));
    if (typeof window !== "undefined") {
      window.console.info("[option-a] reject", { gate, caseId: id });
    }
  };

  // Active gate = first non-decided gate. All earlier are collapsed.
  // (Reads from mock state; no business logic.)
  const activeIdx = gates.findIndex(
    (g) => g.state !== "decided" && !decisions[g.gate],
  );
  const activeGate = activeIdx === -1 ? null : gates[activeIdx]!.gate;

  return (
    <ol className="flex flex-col gap-4">
      {gates.map((g, i) => {
        const overridden = decisions[g.gate];
        const isActive = g.gate === activeGate;
        const decided = g.state === "decided" || !!overridden;
        const rec = recommendations[g.gate];

        return (
          <li
            key={g.gate}
            data-testid={`gate-${g.gate}`}
            className="flex flex-col"
          >
            {decided ? (
              <CollapsedGate
                index={i + 1}
                gate={g.gate}
                decision={overridden?.kind ?? g.decision ?? "approve"}
              />
            ) : isActive && rec ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-mono-sm text-ink-3">
                    Gate {i + 1} of {gates.length}
                  </span>
                  <StatusBadge kind={stateKind(g.state)}>{g.state}</StatusBadge>
                </div>
                <h2 className="font-serif text-h3 font-semi text-ink-1">
                  {g.gate.replace(/_/g, " ")}
                </h2>
                <div className="mt-4">
                  <ApprovalGate
                    caseId={caseId}
                    recommendation={rec}
                    onAccept={onAccept(g.gate)}
                    onEdit={onEdit(g.gate)}
                    onReject={onReject(g.gate)}
                  />
                </div>
              </div>
            ) : (
              <PendingGate index={i + 1} gate={g.gate} />
            )}
          </li>
        );
      })}
    </ol>
  );
};

const CollapsedGate: React.FC<{
  index: number;
  gate: string;
  decision: string;
}> = ({ index, gate, decision }) => (
  <div className="flex items-center justify-between rounded-md border border-rule bg-paper-2 px-4 py-3">
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-mono-sm text-ink-3">{index}</span>
      <span className="font-medium text-ink-1">{gate.replace(/_/g, " ")}</span>
    </div>
    <StatusBadge kind="success">{decision}</StatusBadge>
  </div>
);

const PendingGate: React.FC<{ index: number; gate: string }> = ({
  index,
  gate,
}) => (
  <div className="flex items-center justify-between rounded-md border border-rule border-dashed bg-paper px-4 py-3">
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-mono-sm text-ink-3">{index}</span>
      <span className="font-medium text-ink-2">
        {gate.replace(/_/g, " ")}
      </span>
    </div>
    <StatusBadge kind="neutral">waiting</StatusBadge>
  </div>
);
