import * as React from "react";
import type { AuditTotals } from "../../lib/types";
import { fmtCost, fmtLatency } from "../../lib/audit-format";

interface AuditTotalsBarProps {
  totals: AuditTotals;
  /** Optional element rendered to the right (e.g. Live status pip). */
  trailing?: React.ReactNode;
}

/**
 * Three big serif numbers — time elapsed, spend, touchpoints. The headline
 * surface that tells the banker the AI's whole job at a glance.
 */
export const AuditTotalsBar: React.FC<AuditTotalsBarProps> = ({
  totals,
  trailing,
}) => {
  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg border border-rule bg-paper p-5 md:grid-cols-[1fr,1fr,1fr,auto]">
      <Stat
        label="Time elapsed"
        value={fmtLatency(totals.latencyMs)}
        sub={
          totals.latencyMs > 0
            ? "from intake to current step"
            : "no events yet"
        }
      />
      <Stat
        label="Spend so far"
        value={fmtCost(totals.costUsd, true)}
        sub="model + service cost"
      />
      <Stat
        label="Touchpoints"
        value={`${totals.agentCount}`}
        sub={`${totals.agentCount} specialist${totals.agentCount === 1 ? "" : "s"} · ${totals.serviceCount} service${totals.serviceCount === 1 ? "" : "s"} · ${totals.ruleCount} rule${totals.ruleCount === 1 ? "" : "s"}`}
      />
      {trailing && (
        <div className="flex items-end justify-end pb-1 md:pb-2">{trailing}</div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; sub: string }> = ({
  label,
  value,
  sub,
}) => (
  <div>
    <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
      {label}
    </p>
    <p className="mt-1 font-serif text-display-3 font-semi tabular-nums tracking-tight text-ink-1">
      {value}
    </p>
    <p className="mt-1 text-mono-sm font-mono text-ink-3">{sub}</p>
  </div>
);
