import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import {
  SHARED_RULES,
  RULE_VERDICTS,
  ruleVerdictBadgeKind,
} from "../lib/data";

/**
 * Single horizontal row of the 4 shared rules + their verdict. No values,
 * no thresholds. Just rule name + verdict badge — the executive checks
 * "did anything red trip?" at a glance.
 *
 * No business logic in this component. It reads `RULE_VERDICTS` verbatim
 * from the mock contract.
 */
export const RuleStrip: React.FC = () => (
  <section
    aria-label="Rule verdicts"
    className="flex items-center justify-between gap-4 rounded-md border border-rule bg-paper px-6 py-4"
  >
    {SHARED_RULES.map((rule) => {
      const verdict = RULE_VERDICTS[rule] ?? "skip";
      return (
        <div key={rule} className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-mono-sm text-ink-2 truncate">
            {rule.replace(/_/g, " ")}
          </span>
          <StatusBadge kind={ruleVerdictBadgeKind(verdict)}>
            {verdict}
          </StatusBadge>
        </div>
      );
    })}
  </section>
);
