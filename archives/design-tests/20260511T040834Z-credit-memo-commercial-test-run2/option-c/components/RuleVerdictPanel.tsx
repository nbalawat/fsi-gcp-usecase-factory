import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import { RULE_LABEL, SHARED_RULES } from "../lib/data";

export interface RuleVerdictPanelProps {
  verdicts: Record<string, "pass" | "watch" | "fail" | "skip">;
}

const verdictBadge = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

/**
 * Rule-verdict sidebar rendered inside the FINAL memo section. Pure
 * presentation — verdicts come pre-computed from the rules engine via
 * the mock data; the component never decides anything.
 */
export const RuleVerdictPanel: React.FC<RuleVerdictPanelProps> = ({ verdicts }) => (
  <div>
    <div className="eyebrow">Rules engine</div>
    <h4 className="text-sm font-semibold text-ink-1">Verdicts</h4>
    <ul className="mt-2 flex flex-col gap-1.5">
      {SHARED_RULES.map((r) => {
        const v = verdicts[r] ?? "skip";
        return (
          <li
            key={r}
            className="flex items-center justify-between gap-2 rounded-sm border border-rule bg-paper-2 px-2 py-1.5"
          >
            <span className="truncate text-sm text-ink-1" title={r}>
              {RULE_LABEL[r] ?? r}
            </span>
            <StatusBadge kind={verdictBadge(v)}>{v}</StatusBadge>
          </li>
        );
      })}
    </ul>
  </div>
);
