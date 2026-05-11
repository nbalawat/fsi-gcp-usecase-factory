"use client";

import * as React from "react";
import { ApprovalGate, type ApprovalRecommendation } from "./primitives";

/**
 * UC-OWNED Client boundary wrapping the shared ApprovalGate primitive.
 * Server pages cannot pass functions into Server components, so the
 * disposition handlers (onAccept / onEdit / onDefer / onReject) live in
 * this client child. Per ui-standards: never push inline functions across
 * the Server/Client boundary.
 */
export interface DispositionClientProps {
  caseId: string;
  recommendation: ApprovalRecommendation;
}

export const DispositionClient: React.FC<DispositionClientProps> = ({
  caseId,
  recommendation,
}) => {
  const [last, setLast] = React.useState<string | null>(null);

  // In production these handlers would POST to the dispatch route. Here
  // they record the local action so the UI is functional in the build,
  // and the parent comparator can verify the buttons fire.
  const log = (verb: string, comment?: string) => {
    const stamp = new Date().toISOString().substring(11, 19);
    setLast(`${stamp} · ${verb}${comment ? ` — "${comment}"` : ""}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <ApprovalGate
        caseId={caseId}
        recommendation={recommendation}
        onAccept={(id) => log(`accept (${id}) → ${recommendation.routeTo ?? "downstream"}`)}
        onEdit={(id, c) => log(`edit (${id})`, c)}
        onDefer={(id, c) => log(`defer (${id})`, c)}
        onReject={(id, c) => log(`reject (${id})`, c)}
      />
      {last && (
        <div
          role="status"
          className="rounded-sm border border-accent/40 bg-accent-tint px-3 py-2 font-mono text-mono-sm text-accent-pressed"
        >
          Dispatched: {last}
        </div>
      )}
    </div>
  );
};
