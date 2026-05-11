"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { StageEventList } from "./StageEventList";
import type { GateState, RawEvt } from "../lib/data";

export interface GateRespondClientProps {
  caseId: string;
  gates: GateState[];
  /** Map of gateId → events that scope the conversation leading up to
   *  this gate (every event since the previous gate decision through
   *  this gate's pending event). */
  scopes: Record<string, RawEvt[]>;
  /** Per-gate recommendation. Components/auditor rule: components do
   *  not compute recommendations; they receive them pre-shaped. */
  recommendations: Record<string, ApprovalRecommendation>;
  /** Initial gate to show. */
  initialGate: string;
}

/**
 * Approval flow as a stage-aware gate switcher. The same workflow
 * metaphor as the case page: prior gates compress to a tab strip, the
 * active gate is the hero (scope + ApprovalGate inline), future gates
 * are shown dimmed beneath the actions area.
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
      <p className="px-6 py-10 text-ink-3">
        No gates configured for this case.
      </p>
    );
  }
  const scope = scopes[active.id] ?? [];
  const rec =
    recommendations[active.id] ?? {
      decision: "RETURN_FOR_REVISION",
      rationaleSummary: "Recommendation not yet generated for this gate.",
    };

  const accept = (id: string): void => {
    setPosted((p) => ({ ...p, [active.id]: { disposition: "accepted" } }));
    // eslint-disable-next-line no-console
    console.info("[option-b] accept", { case: id, gate: active.id });
  };
  const edit = (id: string, comment: string): void => {
    setPosted((p) => ({
      ...p,
      [active.id]: { disposition: "returned", comment },
    }));
    // eslint-disable-next-line no-console
    console.info("[option-b] return", { case: id, gate: active.id, comment });
  };
  const reject = (id: string, comment: string): void => {
    setPosted((p) => ({
      ...p,
      [active.id]: { disposition: "rejected", comment },
    }));
    // eslint-disable-next-line no-console
    console.info("[option-b] reject", { case: id, gate: active.id, comment });
  };

  const postedDisp = posted[active.id];

  return (
    <div className="flex flex-col gap-4">
      {/* Gate tab strip — same chrome the workflow rail uses. */}
      <div
        role="tablist"
        aria-label="HITL gates"
        className="flex flex-wrap items-center gap-2 rounded-md border border-rule bg-paper px-4 py-3"
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
                {g.status === "completed" ? (g.decision ?? "decided") : g.status}
              </StatusBadge>
            </button>
          );
        })}
      </div>

      {/* Active gate hero — the scope leading to this gate. */}
      <section
        aria-label={`Conversation leading to ${active.label}`}
        className="rounded-md border border-accent bg-paper"
      >
        <header className="flex items-baseline justify-between border-b border-rule px-5 py-4">
          <div>
            <div className="eyebrow">Approval hero · gate scope</div>
            <h2 className="font-serif text-h2 font-semi text-ink-1">
              {active.label}
            </h2>
          </div>
          <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
            {scope.length} prior events
          </span>
        </header>
        <StageEventList
          events={scope}
          emptyLabel="No prior events for this gate."
        />
      </section>

      {/* Signoff zone — irrevocable for final_approval per recommendation. */}
      {active.status === "completed" ? (
        <section
          aria-label="Gate already decided"
          className="rounded-md border border-rule bg-paper p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="eyebrow">Already decided</div>
              <h3 className="text-h4 font-semi text-ink-1">{active.label}</h3>
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
            A new event will appear on case {caseId} once the workflow
            confirms.
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
