import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import { type RunRecord, fmtUsdM } from "../lib/data";

interface Props {
  run: RunRecord;
}

const STATUS_KIND: Record<RunRecord["runStatus"], "success" | "warning" | "danger"> = {
  "on-track": "success",
  watch: "warning",
  "at-risk": "danger",
};

const STATUS_LABEL: Record<RunRecord["runStatus"], string> = {
  "on-track": "On track",
  watch: "Watch",
  "at-risk": "At risk",
};

/**
 * Sparse executive hero. Three numbers, one status pill, no chrome.
 * Server component — display-only.
 *
 * Density discipline: every pixel on this row has to earn its place.
 * Numbers are big (serif h1), labels are eyebrow (11px tracked), and
 * the only horizontal furniture is the status pill.
 */
export const RunHero: React.FC<Props> = ({ run }) => {
  const deltaSign = run.qoqDelta_usd_m >= 0 ? "+" : "-";
  return (
    <header className="border-b border-rule px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-6">
        <div className="min-w-0">
          <div className="eyebrow">CECL run · {run.period}</div>
          <h1 className="mt-1 font-serif text-h1 font-semi text-ink-1">
            {run.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-mono-sm text-ink-3">
            <span>{run.id}</span>
            <span aria-hidden>·</span>
            <span>SEC 10-Q · OCC ALLL filing</span>
            <span aria-hidden>·</span>
            <StatusBadge kind={STATUS_KIND[run.runStatus]}>
              {STATUS_LABEL[run.runStatus]}
            </StatusBadge>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <HeroNum
            label="Total allowance"
            value={fmtUsdM(run.totalAllowance_usd_m)}
          />
          <HeroNum
            label="QoQ delta"
            value={`${deltaSign}${fmtUsdM(Math.abs(run.qoqDelta_usd_m))}`}
            tone={run.qoqDelta_usd_m > 0 ? "warning" : "ok"}
          />
          <HeroNum
            label="Exceptions"
            value={`${run.exceptionCount}`}
            tone={run.exceptionCount > 2 ? "warning" : "neutral"}
          />
        </div>
      </div>
    </header>
  );
};

const TONE_CLASS: Record<"neutral" | "ok" | "warning", string> = {
  neutral: "text-ink-1",
  ok: "text-semantic-success",
  warning: "text-semantic-warning",
};

const HeroNum: React.FC<{
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warning";
}> = ({ label, value, tone = "neutral" }) => (
  <div className="flex min-w-[8rem] flex-col items-end">
    <span className="eyebrow text-right">{label}</span>
    <span
      className={`mt-1 font-serif text-h1 font-semi leading-none tabular-nums tracking-tight ${TONE_CLASS[tone]}`}
    >
      {value}
    </span>
  </div>
);
