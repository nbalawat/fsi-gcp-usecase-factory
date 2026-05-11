import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { CaseRecord, SignalSnapshot } from "../lib/data";

export interface ExecutiveDecisionCardProps {
  c: CaseRecord;
  signal: SignalSnapshot;
  /** Pre-shaped one-sentence rationale — passed in (no decision math in
   *  components per the architecture-auditor rule). */
  rationaleSentence: string;
  /** Pre-shaped recommended approval authority for the final call. */
  authority: string;
  /** Pre-shaped recommended action verb ("APPROVE" / "DECLINE" / "RETURN"). */
  recommendation: string;
}

const riskBandKind = (
  band: string,
): "success" | "warning" | "danger" | "neutral" => {
  if (band.startsWith("1")) return "success";
  if (band.startsWith("2")) return "warning";
  if (band.startsWith("3") || band.startsWith("4") || band.startsWith("5"))
    return "danger";
  return "neutral";
};

const decisionKind = (
  d: string,
): "success" | "warning" | "danger" | "accent" | "neutral" => {
  if (d === "APPROVE" || d === "approve") return "accent";
  if (d === "DECLINE" || d === "decline") return "danger";
  if (d === "RETURN" || d === "return") return "warning";
  return "neutral";
};

/**
 * THE PAGE.
 *
 * The artifact IS the page. One oversize decision card carries the
 * borrower identity, the recommendation verb, the risk band, the
 * one-sentence rationale, and the four "this is why I trust it"
 * signals — and that is all. Everything else compresses into a thin
 * right-rail or fades to ink-3.
 *
 * Pure presentation — every value comes from the mock data. No
 * thresholds checked, no business decisions made here.
 */
export const ExecutiveDecisionCard: React.FC<ExecutiveDecisionCardProps> = ({
  c,
  signal,
  rationaleSentence,
  authority,
  recommendation,
}) => {
  return (
    <article
      aria-label="Executive decision card"
      className="rounded-md border border-rule bg-paper-pure px-10 py-10"
    >
      {/* Identity strip */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="font-mono text-xs uppercase tracking-wider text-ink-3">
          {c.id} · {c.borrower.geo} · NAICS {c.borrower.naics}
        </div>
        <StatusBadge kind={riskBandKind(c.borrower.risk_band)}>
          {c.borrower.risk_band}
        </StatusBadge>
      </div>

      {/* The recommendation — the page's hero. */}
      <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-tight text-ink-1">
        {c.title}
      </h1>

      <div className="mt-8 flex flex-wrap items-baseline gap-4">
        <StatusBadge kind={decisionKind(recommendation)}>
          {recommendation}
        </StatusBadge>
        <span className="font-mono text-sm text-ink-3">
          recommended by AI · sign-off: {authority}
        </span>
      </div>

      {/* One-sentence rationale — the only paragraph on the page. */}
      <p className="mt-6 max-w-3xl font-serif text-lg leading-snug text-ink-2">
        {rationaleSentence}
      </p>

      {/* Four signals — a single horizontal line of tiny numbers. */}
      <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-3 border-t border-rule pt-6 md:grid-cols-4">
        <Signal
          label="Rule verdicts"
          value={`${signal.rulesPass}/${signal.rulesTotal} pass`}
          tone={signal.rulesFail > 0 ? "danger" : signal.rulesWatch > 0 ? "warning" : "ok"}
        />
        <Signal
          label="Gates decided"
          value={`${signal.gatesDecided}/${signal.gatesTotal}`}
          tone={signal.gatesDecided === signal.gatesTotal ? "ok" : "warning"}
        />
        <Signal
          label="Agent reasonings"
          value={`${signal.agentReasonings}`}
          tone="neutral"
        />
        <Signal
          label="Service calls"
          value={`${signal.serviceCalls}`}
          tone="neutral"
        />
      </dl>
    </article>
  );
};

const Signal: React.FC<{
  label: string;
  value: string;
  tone: "ok" | "warning" | "danger" | "neutral";
}> = ({ label, value, tone }) => {
  const toneClass =
    tone === "ok"
      ? "text-semantic-success"
      : tone === "warning"
        ? "text-semantic-warning"
        : tone === "danger"
          ? "text-semantic-danger"
          : "text-ink-1";
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-wider text-ink-3">
        {label}
      </dt>
      <dd
        className={`mt-1 font-serif text-2xl font-semibold tabular-nums ${toneClass}`}
      >
        {value}
      </dd>
    </div>
  );
};
