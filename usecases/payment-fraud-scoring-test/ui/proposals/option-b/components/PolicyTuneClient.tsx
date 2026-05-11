"use client";

import * as React from "react";
import { ApprovalGate, StatusBadge } from "@fsi-bank/components";
import type { ApprovalRecommendation } from "@fsi-bank/components";
import { diffPolicy, type PolicyThreshold } from "../lib/data";

export interface PolicyTuneClientProps {
  /** The policy thresholds the operator can tune. */
  policies: readonly PolicyThreshold[];
  /** Pre-shaped recommendations by policy id — never computed in the component. */
  recommendations: Record<string, ApprovalRecommendation>;
  /** Initial selected policy id. */
  initialId: string;
}

const formatClock = (iso: string): string => iso.substring(0, 10);

/**
 * Policy-tuning surface. Real-time fraud has NO per-transaction HITL —
 * humans tune rules and band thresholds, not individual cases. This
 * client component lets the operator:
 *
 *   1. Pick one policy threshold (left tab strip)
 *   2. Type a proposed value (real input, not a styled div)
 *   3. See the pre-computed diff vs current
 *   4. Submit via the shared ApprovalGate primitive (the only path
 *      that records the change for audit)
 *
 * No decision math here — the diff is a pure subtraction.
 */
export const PolicyTuneClient: React.FC<PolicyTuneClientProps> = ({
  policies,
  recommendations,
  initialId,
}) => {
  const [activeId, setActiveId] = React.useState<string>(initialId);
  const active = policies.find((p) => p.id === activeId) ?? policies[0];
  const [proposed, setProposed] = React.useState<string>(
    active ? String(active.current) : "",
  );
  const [posted, setPosted] = React.useState<
    Record<string, { disposition: string; comment?: string; value?: number }>
  >({});

  // Whenever the operator selects a different policy, reset the input
  // to that policy's current value (so they tune deltas, not absolutes).
  const selectPolicy = (id: string): void => {
    const next = policies.find((p) => p.id === id);
    if (!next) return;
    setActiveId(id);
    setProposed(String(next.current));
  };

  if (!active) {
    return (
      <p className="px-6 py-10 text-ink-3">
        No tunable policy thresholds configured.
      </p>
    );
  }

  const proposedNum = Number(proposed);
  const proposedValid = !Number.isNaN(proposedNum);
  const diff = proposedValid ? diffPolicy(active, proposedNum) : null;
  const rec = recommendations[active.id] ?? {
    decision: "RETURN_FOR_REVISION",
    rationaleSummary:
      "Recommendation not yet generated for this policy threshold.",
  };

  const accept = (id: string): void => {
    setPosted((p) => ({
      ...p,
      [active.id]: { disposition: "accepted", value: proposedNum },
    }));
    // eslint-disable-next-line no-console
    console.info("[option-b] policy accept", {
      policy: active.id,
      caseId: id,
      proposed: proposedNum,
    });
  };
  const edit = (id: string, comment: string): void => {
    setPosted((p) => ({
      ...p,
      [active.id]: { disposition: "returned", comment, value: proposedNum },
    }));
    // eslint-disable-next-line no-console
    console.info("[option-b] policy return", {
      policy: active.id,
      caseId: id,
      comment,
    });
  };
  const reject = (id: string, comment: string): void => {
    setPosted((p) => ({
      ...p,
      [active.id]: { disposition: "rejected", comment, value: proposedNum },
    }));
    // eslint-disable-next-line no-console
    console.info("[option-b] policy reject", {
      policy: active.id,
      caseId: id,
      comment,
    });
  };

  const postedDisp = posted[active.id];

  return (
    <div className="flex flex-col gap-4">
      {/* Policy tab strip — every tunable threshold is reachable in one click. */}
      <div
        role="tablist"
        aria-label="Policy thresholds"
        className="flex flex-wrap items-center gap-2 border-b border-rule bg-paper px-4 py-3"
      >
        <span className="eyebrow mr-2">Policy</span>
        {policies.map((p) => {
          const isActive = p.id === active.id;
          const label = p.mcc
            ? `${p.rule} · MCC ${p.mcc}`
            : p.rule;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectPolicy(p.id)}
              className={[
                "flex items-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-mono-sm transition",
                isActive
                  ? "border-accent bg-accent-tint text-accent-pressed"
                  : "border-rule bg-paper text-ink-2 hover:bg-paper-2",
              ].join(" ")}
            >
              <span>{label}</span>
              <span className="text-ink-3">{p.current}</span>
            </button>
          );
        })}
      </div>

      {/* Current state of the selected policy. */}
      <section
        aria-label={`Policy ${active.id}`}
        className="rounded-md border border-rule bg-paper"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
          <div>
            <div className="eyebrow">Policy threshold</div>
            <h2 className="font-serif text-h3 font-semi text-ink-1">
              {active.rule}
            </h2>
            <p className="mt-1 font-mono text-mono-sm text-ink-3">
              {active.param}
              {active.mcc ? ` · MCC ${active.mcc}` : ""} · {active.unit}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="eyebrow">last changed</span>
            <span className="font-mono text-mono-sm text-ink-2">
              {formatClock(active.last_changed_at)}
            </span>
          </div>
        </header>

        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1fr_1fr]">
          {/* Tuning surface — real input, not a styled div. */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="proposed-value"
              className="eyebrow"
            >
              Proposed value
            </label>
            <input
              id="proposed-value"
              type="number"
              step="0.01"
              value={proposed}
              onChange={(e) => setProposed(e.target.value)}
              className="rounded-sm border border-rule bg-paper px-3 py-2 font-mono text-mono-lg text-ink-1 focus:border-accent focus:outline-none"
            />
            <p className="font-mono text-mono-sm text-ink-3">
              current {active.current} {active.unit} · curve at current{" "}
              {active.champion_curve_at_current.toFixed(2)}
            </p>
          </div>

          {/* Pre-shaped diff panel. */}
          <div className="rounded-sm border border-rule bg-paper-2 px-3 py-3">
            <div className="eyebrow mb-2">Diff vs current</div>
            {diff ? (
              <ul className="flex flex-col gap-1.5 font-mono text-mono-sm text-ink-2">
                <li className="flex justify-between">
                  <span>current</span>
                  <span className="tabular-nums">
                    {diff.current} {diff.unit}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>proposed</span>
                  <span className="tabular-nums text-ink-1">
                    {diff.proposed} {diff.unit}
                  </span>
                </li>
                <li className="flex justify-between border-t border-rule pt-1.5">
                  <span>delta</span>
                  <span
                    className={[
                      "tabular-nums",
                      diff.delta > 0
                        ? "text-semantic-warning"
                        : diff.delta < 0
                          ? "text-semantic-info"
                          : "text-ink-3",
                    ].join(" ")}
                  >
                    {diff.delta > 0 ? "+" : ""}
                    {diff.delta.toFixed(2)} {diff.unit}
                  </span>
                </li>
              </ul>
            ) : (
              <p className="font-mono text-mono-sm text-ink-3">
                Enter a numeric value to see the diff.
              </p>
            )}
          </div>
        </div>

        {/* Day-impact panel — what the current threshold does per day. */}
        <div className="grid grid-cols-3 gap-2 border-t border-rule px-4 py-4">
          <div className="rounded-sm border border-rule bg-semantic-successTint px-3 py-2">
            <div className="eyebrow">auto-approve</div>
            <div className="mt-0.5 font-serif text-h4 font-semi text-ink-1 tabular-nums">
              {active.impact_per_day.auto_approve.toLocaleString()}
            </div>
            <div className="font-mono text-mono-sm text-ink-3">
              tx / day at current
            </div>
          </div>
          <div className="rounded-sm border border-rule bg-semantic-warningTint px-3 py-2">
            <div className="eyebrow">gray (agent)</div>
            <div className="mt-0.5 font-serif text-h4 font-semi text-ink-1 tabular-nums">
              {active.impact_per_day.gray.toLocaleString()}
            </div>
            <div className="font-mono text-mono-sm text-ink-3">
              tx / day at current
            </div>
          </div>
          <div className="rounded-sm border border-rule bg-semantic-dangerTint px-3 py-2">
            <div className="eyebrow">auto-decline</div>
            <div className="mt-0.5 font-serif text-h4 font-semi text-ink-1 tabular-nums">
              {active.impact_per_day.auto_decline.toLocaleString()}
            </div>
            <div className="font-mono text-mono-sm text-ink-3">
              tx / day at current
            </div>
          </div>
        </div>
      </section>

      {/* Submission — the shared ApprovalGate primitive is the only path
          that records the policy change for audit. */}
      {postedDisp ? (
        <section
          aria-label="Policy change posted"
          className="rounded-md border border-semantic-success/60 bg-semantic-successTint p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-h4 font-semi text-ink-1">
              {active.rule}
              {active.mcc ? ` · MCC ${active.mcc}` : ""} →{" "}
              {postedDisp.disposition}
            </h3>
            <StatusBadge kind="success">posted</StatusBadge>
          </div>
          <p className="mt-2 font-mono text-mono-sm text-ink-2">
            proposed value {postedDisp.value} {active.unit}
          </p>
          {postedDisp.comment && (
            <p className="mt-2 text-ui text-ink-2">
              <span className="eyebrow mr-2">comment</span>
              {postedDisp.comment}
            </p>
          )}
          <p className="mt-2 font-mono text-mono-sm text-ink-3">
            The policy diff has been queued for review. The change will
            take effect once the model owner approves and the rules
            service reloads.
          </p>
        </section>
      ) : (
        <ApprovalGate
          caseId={active.id}
          recommendation={rec}
          onAccept={accept}
          onEdit={edit}
          onReject={reject}
        />
      )}
    </div>
  );
};
