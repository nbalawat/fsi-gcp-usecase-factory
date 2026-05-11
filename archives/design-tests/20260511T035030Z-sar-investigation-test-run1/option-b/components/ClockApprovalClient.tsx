"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { ClockEventRow } from "./ClockEventRow";
import type { ClockEvent, GateState } from "../lib/data";

export interface ClockApprovalClientProps {
  caseId: string;
  gate: GateState;
  /** Events leading up to this gate, in chronological order — same clock
   *  axis as the case page. */
  scope: ClockEvent[];
  recommendation: ApprovalRecommendation;
}

/**
 * Approval surface for the SAR final signoff. The clock metaphor carries
 * through: the page shows the gate's deadline anchor, the conversation
 * slice with days-remaining on every event, and the ApprovalGate primitive
 * inline at the bottom — all of which lives on the same temporal axis.
 *
 * Wildcard freedom: the "approval app" isn't a separate flow — it's the
 * same clock view, scoped to one gate.
 */
export const ClockApprovalClient: React.FC<ClockApprovalClientProps> = ({
  caseId,
  gate,
  scope,
  recommendation,
}) => {
  const [posted, setPosted] = React.useState<
    null | { disposition: string; comment?: string }
  >(null);

  const accept = (id: string): void => {
    setPosted({ disposition: "accepted" });
    // eslint-disable-next-line no-console
    console.info("[option-b] accept", { case: id, gate: gate.id });
  };
  const edit = (id: string, comment: string): void => {
    setPosted({ disposition: "returned", comment });
    // eslint-disable-next-line no-console
    console.info("[option-b] return", { case: id, gate: gate.id, comment });
  };
  const reject = (id: string, comment: string): void => {
    setPosted({ disposition: "rejected", comment });
    // eslint-disable-next-line no-console
    console.info("[option-b] reject", { case: id, gate: gate.id, comment });
  };

  const dr = gate.daysRemainingWhenPending;
  const drIsCritical = dr !== undefined && dr <= 4;

  return (
    <div className="flex flex-col gap-4">
      <header
        aria-label="Gate header"
        className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border border-rule bg-paper px-4 py-4"
      >
        <div>
          <div className="eyebrow">SAR signoff · regulatory clock</div>
          <h2 className="font-serif text-2xl font-medium text-ink-1">
            {gate.label}
          </h2>
          {dr !== undefined && (
            <p
              className={[
                "mt-1 font-mono text-mono-sm tabular-nums",
                drIsCritical ? "text-semantic-warning" : "text-ink-2",
              ].join(" ")}
            >
              Pending raised with {dr.toFixed(1)} days remaining on the SAR
              clock.
            </p>
          )}
        </div>
        <StatusBadge
          kind={
            gate.status === "completed"
              ? "success"
              : gate.status === "pending"
                ? "warning"
                : "neutral"
          }
        >
          {gate.status === "completed"
            ? (gate.decision ?? "decided")
            : gate.status}
        </StatusBadge>
      </header>

      <section
        aria-label={`Conversation leading to ${gate.label}`}
        className="rounded-md border border-rule bg-paper"
      >
        <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
          <div>
            <div className="eyebrow">Conversation scope</div>
            <h3 className="font-serif text-lg font-medium text-ink-1">
              Every event leading up to this gate
            </h3>
          </div>
          <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
            {scope.length} {scope.length === 1 ? "event" : "events"}
          </span>
        </header>
        {scope.length === 0 ? (
          <p className="px-4 py-6 text-caption text-ink-3">
            No prior conversation rows for this gate.
          </p>
        ) : (
          <ol className="flex flex-col">
            {scope.map((e) => (
              <ClockEventRow key={e.idx} event={e} />
            ))}
          </ol>
        )}
      </section>

      {gate.status === "completed" ? (
        <section
          aria-label="Gate already decided"
          className="rounded-md border border-rule bg-paper p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="eyebrow">Already decided</div>
              <h3 className="font-serif text-lg font-medium text-ink-1">
                {gate.label}
              </h3>
            </div>
            <StatusBadge
              kind={gate.decision === "approve" || gate.decision === "file" ? "success" : "neutral"}
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
          className="rounded-md border border-semantic-success/60 bg-semantic-successTint p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-serif text-lg font-medium text-ink-1">
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
            A new event will be appended to case {caseId} once the workflow
            confirms.
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
