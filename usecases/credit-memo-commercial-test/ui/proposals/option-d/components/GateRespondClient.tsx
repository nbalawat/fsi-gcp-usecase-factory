"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { TranscriptRow } from "./TranscriptRow";
import type { GateState, TranscriptRow as RowData } from "../lib/data";

export interface GateRespondClientProps {
  caseId: string;
  gates: GateState[];
  /** Map of gateId → ordered transcript rows that scope this gate's
   *  conversation (everything between the previous gate decision and
   *  this gate's pending event). */
  scopes: Record<string, RowData[]>;
  /** Recommendation each gate carries. The auditor doesn't allow
   *  decision math in components, so these recommendations are passed
   *  in pre-shaped. */
  recommendations: Record<string, ApprovalRecommendation>;
  /** Initial gate to show — usually from ?gate=… */
  initialGate: string;
}

/**
 * Approval flow rendered AS a transcript scope. The user picks a gate
 * from the tab strip, sees the conversation slice that led up to that
 * gate, then approves / returns / rejects via the shared ApprovalGate
 * primitive inline at the bottom of the scope.
 *
 * Wildcard freedom: there is no separate "review the memo, then click
 * approve" flow — the memo IS the conversation; you sign off on the
 * conversation.
 */
export const GateRespondClient: React.FC<GateRespondClientProps> = ({
  caseId,
  gates,
  scopes,
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
      <p className="px-6 py-10 text-ink-3">No gates configured for this case.</p>
    );
  }
  const rows = scopes[active.id] ?? [];
  const rec = recommendations[active.id] ?? {
    decision: "RETURN_FOR_REVISION",
    rationaleSummary:
      "Recommendation not yet generated for this gate.",
  };

  const accept = (id: string): void => {
    setPosted((p) => ({ ...p, [active.id]: { disposition: "accepted" } }));
    // eslint-disable-next-line no-console
    console.info("[option-d] accept", { case: id, gate: active.id });
  };
  const edit = (id: string, comment: string): void => {
    setPosted((p) => ({ ...p, [active.id]: { disposition: "returned", comment } }));
    // eslint-disable-next-line no-console
    console.info("[option-d] return", { case: id, gate: active.id, comment });
  };
  const reject = (id: string, comment: string): void => {
    setPosted((p) => ({ ...p, [active.id]: { disposition: "rejected", comment } }));
    // eslint-disable-next-line no-console
    console.info("[option-d] reject", { case: id, gate: active.id, comment });
  };

  const postedDisp = posted[active.id];

  return (
    <div className="flex flex-col gap-4">
      {/* Gate tab strip — every HITL gate is reachable in one click. */}
      <div
        role="tablist"
        aria-label="HITL gates"
        className="flex flex-wrap items-center gap-2 border-b border-rule bg-paper px-4 py-3"
      >
        <span className="eyebrow mr-2">Gate</span>
        {gates.map((g) => {
          const isActive = g.id === active.id;
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveGate(g.id)}
              className={[
                "flex items-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-mono-sm transition",
                isActive
                  ? "border-accent bg-accent-tint text-accent-pressed"
                  : "border-rule bg-paper text-ink-2 hover:bg-paper-2",
              ].join(" ")}
            >
              <span>{g.label}</span>
              <StatusBadge
                kind={
                  g.status === "completed"
                    ? "success"
                    : g.status === "pending"
                      ? "warning"
                      : "neutral"
                }
              >
                {g.status === "completed"
                  ? g.decision ?? "decided"
                  : g.status}
              </StatusBadge>
            </button>
          );
        })}
      </div>

      {/* Gate scope — the slice of the transcript that led to this gate. */}
      <section
        aria-label={`Conversation leading to ${active.label}`}
        className="rounded-md border border-rule bg-paper"
      >
        <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
          <div>
            <div className="eyebrow">Conversation scope</div>
            <h2 className="font-serif text-h3 font-semi text-ink-1">
              {active.label}
            </h2>
          </div>
          <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
            {rows.length} entries
          </span>
        </header>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-caption text-ink-3">
            No prior conversation rows for this gate.
          </p>
        ) : (
          <ol className="flex flex-col">
            {rows.map((r) => (
              <TranscriptRow key={r.idx} row={r} />
            ))}
          </ol>
        )}
      </section>

      {/* The signoff itself — inline at the bottom of the scope. */}
      {active.status === "completed" ? (
        <section
          aria-label="Gate already decided"
          className="rounded-md border border-rule bg-paper p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="eyebrow">Already decided</div>
              <h3 className="text-h4 font-semi text-ink-1">
                {active.label}
              </h3>
            </div>
            <StatusBadge
              kind={active.decision === "approve" ? "success" : "neutral"}
            >
              {active.decision ?? "decided"}
            </StatusBadge>
          </div>
          <p className="mt-2 text-caption text-ink-3">
            Disposition recorded {active.decidedAt ?? ""}. Reopen requires a
            new review event.
          </p>
        </section>
      ) : postedDisp ? (
        <section
          aria-label="Disposition posted"
          className="rounded-md border border-semantic-success/60 bg-semantic-successTint p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-h4 font-semi text-ink-1">
              {active.label} → {postedDisp.disposition}
            </h3>
            <StatusBadge kind="success">posted</StatusBadge>
          </div>
          {postedDisp.comment && (
            <p className="mt-2 text-ui text-ink-2">
              <span className="eyebrow mr-2">comment</span>
              {postedDisp.comment}
            </p>
          )}
          <p className="mt-2 font-mono text-mono-sm text-ink-3">
            A new transcript row will appear on case {caseId} once the
            workflow confirms.
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
