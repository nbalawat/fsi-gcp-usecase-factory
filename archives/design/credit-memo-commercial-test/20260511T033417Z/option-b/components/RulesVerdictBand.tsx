import * as React from "react";
import { StatusBadge, MetricStrip, type Metric } from "@fsi-bank/components";
import { RULE_VERDICTS, SHARED_RULES, verdictTone } from "../lib/data";

/**
 * Band that surfaces the four shared rule verdicts. No math, no thresholds
 * — pulls verdict strings verbatim from mock-data.
 *
 * Uses the shared MetricStrip for the headline counts and StatusBadge for
 * each rule's verdict pill.
 */
export const RulesVerdictBand: React.FC = () => {
  const passes = SHARED_RULES.filter((r) => RULE_VERDICTS[r] === "pass").length;
  const watches = SHARED_RULES.filter((r) => RULE_VERDICTS[r] === "watch").length;
  const fails = SHARED_RULES.filter((r) => RULE_VERDICTS[r] === "fail").length;

  const metrics: Metric[] = [
    {
      id: "rules-total",
      label: "Rules evaluated",
      value: SHARED_RULES.length,
      tooltip: "Shared rules in the canvas",
    },
    {
      id: "rules-pass",
      label: "Pass",
      value: passes,
      state: "ok",
    },
    {
      id: "rules-watch",
      label: "Watch",
      value: watches,
      state: watches > 0 ? "warning" : "ok",
    },
    {
      id: "rules-fail",
      label: "Fail",
      value: fails,
      state: fails > 0 ? "alert" : "ok",
    },
  ];

  return (
    <section
      aria-label="Rules verdicts"
      className="flex flex-col gap-2 rounded-md border border-rule bg-paper"
    >
      <MetricStrip metrics={metrics} />
      <ul className="grid grid-cols-1 gap-2 px-6 pb-4 md:grid-cols-2">
        {SHARED_RULES.map((rule) => {
          const verdict = RULE_VERDICTS[rule];
          return (
            <li
              key={rule}
              className="flex items-center justify-between rounded-md border border-rule bg-paper-2 px-3 py-2"
            >
              <span className="font-mono text-mono-sm text-ink-1 truncate">
                {rule}
              </span>
              <StatusBadge kind={verdictTone(verdict)}>
                {verdict ?? "skip"}
              </StatusBadge>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
