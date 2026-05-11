import * as React from "react";
import { StatusBadge, StepProgress } from "@fsi-bank/components";
import type { ActivityLine, GateState } from "../lib/data";

export interface RightRailProps {
  gates: readonly GateState[];
  activity: readonly ActivityLine[];
  ruleVerdicts: Record<string, "pass" | "watch" | "fail" | "skip">;
  ruleOrder: readonly string[];
  /** Total events (used to drive the StepProgress dots) */
  totalEvents: number;
  /** Number of agent calls completed */
  agentCalls: number;
  /** Number of agents this case is expected to run (from canvas) */
  agentTotal: number;
  canvasShaShort: string;
}

const RULE_LABEL: Record<string, string> = {
  single_borrower_exposure: "Single-borrower exposure",
  insider_aggregate_limit: "Insider aggregate limit",
  reg_o_individual_limit: "Reg O individual limit",
};

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

/**
 * Tiny right rail — everything that is NOT the decision compresses here.
 * Three blocks, all short:
 *   1. Gate state (the HITL signoff)
 *   2. Rule verdicts (one badge per rule)
 *   3. Activity feed (compressed; one line per distinct agent/service)
 * Plus a pinned canvas SHA for provenance.
 *
 * Server component — no interactivity.
 */
export const RightRail: React.FC<RightRailProps> = ({
  gates,
  activity,
  ruleVerdicts,
  ruleOrder,
  totalEvents,
  agentCalls,
  agentTotal,
  canvasShaShort,
}) => {
  const stepStatus = agentCalls >= agentTotal ? "done" : "active";

  return (
    <aside
      aria-label="Case context"
      className="flex w-full flex-col gap-5 border-l border-rule bg-paper-2 px-5 py-6"
    >
      {/* Pipeline progress */}
      <section aria-label="Pipeline progress" className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
          agents
        </span>
        <StepProgress
          total={agentTotal}
          done={agentCalls}
          status={stepStatus}
          currentLabel={
            stepStatus === "done" ? "complete" : "in flight"
          }
        />
        <span className="font-mono text-xs text-ink-3">
          {totalEvents} events on record
        </span>
      </section>

      {/* HITL gates */}
      <section aria-label="HITL gates" className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
          gates
        </span>
        <ul className="flex flex-col gap-1.5">
          {gates.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate text-sm text-ink-1">{g.label}</span>
              <StatusBadge
                kind={
                  g.status === "completed"
                    ? "success"
                    : g.status === "pending"
                      ? "warning"
                      : "neutral"
                }
              >
                {g.status}
              </StatusBadge>
            </li>
          ))}
        </ul>
      </section>

      {/* Rule verdicts */}
      <section aria-label="Rule verdicts" className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
          rules
        </span>
        <ul className="flex flex-col gap-1.5">
          {ruleOrder.map((r) => {
            const v = ruleVerdicts[r] ?? "skip";
            return (
              <li
                key={r}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate text-sm text-ink-1">
                  {RULE_LABEL[r] ?? r}
                </span>
                <StatusBadge kind={verdictBadge(v)}>{v}</StatusBadge>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Activity feed (compressed) */}
      <section aria-label="Activity" className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
          activity
        </span>
        <ul className="flex flex-col gap-1">
          {activity.map((a) => (
            <li
              key={`${a.kind}-${a.ref}`}
              className="flex items-baseline justify-between gap-2 font-mono text-xs text-ink-2"
            >
              <span className="truncate">
                <span className="text-ink-3">{a.kind}</span>{" "}
                <span className="text-ink-1">{a.label}</span>
              </span>
              <span className="text-ink-3">
                {new Date(a.at).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Canvas pin */}
      <section className="mt-auto border-t border-rule pt-4">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
          canvas
        </span>
        <div className="mt-1 font-mono text-xs text-ink-2">
          {canvasShaShort}… pinned
        </div>
      </section>
    </aside>
  );
};
