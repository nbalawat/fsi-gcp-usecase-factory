import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";

export interface DecisionHeroProps {
  caseId: string;
  borrowerName: string;
  geo: string;
  naics: string;
  title: string;
  /** file_sar | dismiss | escalate */
  decision: string;
  /** banker-readable one-line reason */
  reasonHeadline: string;
  approvalHref: string;
}

/**
 * The decision IS the page. A BSA Officer scanning 30+ cases sees, in
 * order of importance:
 *   1. What is the recommended decision (file SAR / dismiss / escalate)
 *   2. The one alert reason that explains why
 *   3. The case identity (borrower, geo, NAICS — small)
 * The Open Approval Gate affordance sits right next to the decision —
 * one click from glance to disposition.
 *
 * Server component — no interactivity beyond the anchor.
 */
const DECISION_TONE: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  file_sar: "danger",
  escalate: "warning",
  dismiss: "success",
};

const DECISION_LABEL: Record<string, string> = {
  file_sar: "FILE SAR",
  escalate: "ESCALATE",
  dismiss: "DISMISS",
};

export const DecisionHero: React.FC<DecisionHeroProps> = ({
  caseId,
  borrowerName,
  geo,
  naics,
  title,
  decision,
  reasonHeadline,
  approvalHref,
}) => {
  const tone = DECISION_TONE[decision] ?? "neutral";
  const label = DECISION_LABEL[decision] ?? decision;

  return (
    <section
      aria-label="Recommended decision"
      className="border-b border-rule bg-paper px-8 py-10"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-3">
            recommendation
          </span>
          <StatusBadge kind={tone}>{label}</StatusBadge>
        </div>

        <h1 className="font-serif text-5xl font-semibold leading-tight text-ink-1">
          {reasonHeadline}
        </h1>

        <div className="flex flex-wrap items-center gap-3 font-mono text-sm text-ink-3">
          <span>{caseId}</span>
          <span aria-hidden>·</span>
          <span className="text-ink-2">{borrowerName}</span>
          <span aria-hidden>·</span>
          <span>{geo}</span>
          <span aria-hidden>·</span>
          <span>NAICS {naics}</span>
        </div>

        <p className="max-w-3xl text-base text-ink-2">{title}</p>

        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href={approvalHref}
            className="rounded-sm bg-ink-1 px-5 py-2.5 font-mono text-sm font-medium text-paper hover:bg-ink-2"
          >
            Open approval gate →
          </a>
          <a
            href={approvalHref + "?action=dismiss"}
            className="rounded-sm border border-rule px-5 py-2.5 font-mono text-sm text-ink-2 hover:bg-paper-2"
          >
            Dismiss
          </a>
          <a
            href={approvalHref + "?action=escalate"}
            className="rounded-sm border border-rule px-5 py-2.5 font-mono text-sm text-ink-2 hover:bg-paper-2"
          >
            Escalate
          </a>
        </div>
      </div>
    </section>
  );
};
