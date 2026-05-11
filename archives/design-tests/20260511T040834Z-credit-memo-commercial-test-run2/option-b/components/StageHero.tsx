import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import { StageEventList } from "./StageEventList";
import { summariseBucket, type StageBucket } from "../lib/data";

export interface StageHeroProps {
  /** The bucket representing the current/focused stage. */
  bucket: StageBucket;
  /** Optional title override; defaults to bucket.label. */
  title?: string;
  /** Optional CTA — e.g. "Open approval flow →" */
  cta?: React.ReactNode;
}

/**
 * The hero stage panel. ~60% of viewport: big eyebrow + h2, summary
 * chips for service/agent/human/pending counts, the event list itself,
 * an optional CTA. The hero is the page's centre of gravity in the
 * workflow-first metaphor.
 *
 * Pure presentation — receives a fully-shaped bucket from the adapter.
 */
export const StageHero: React.FC<StageHeroProps> = ({
  bucket,
  title,
  cta,
}) => {
  const sum = summariseBucket(bucket);
  const status: "success" | "warning" | "neutral" =
    bucket.status === "active"
      ? "warning"
      : bucket.status === "done"
        ? "success"
        : "neutral";

  return (
    <section
      aria-label={`Current stage: ${bucket.label}`}
      className="rounded-md border border-accent bg-paper shadow-sm"
      data-stage={bucket.id}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
        <div className="min-w-0">
          <div className="eyebrow">Current stage · workflow hero</div>
          <h2 className="font-serif text-h2 font-semi text-ink-1">
            {title ?? bucket.label}
          </h2>
          {bucket.enteredAt && (
            <p className="mt-1 font-mono text-mono-sm text-ink-3">
              entered {bucket.enteredAt.substring(11, 19)} UTC
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind={status}>{bucket.status}</StatusBadge>
          {cta}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 border-b border-rule px-5 py-3 sm:grid-cols-4">
        <SummaryChip label="Services" value={sum.serviceCalls} tone="accent" />
        <SummaryChip label="Agents" value={sum.agentCalls} tone="info" />
        <SummaryChip label="Human actions" value={sum.humanActions} tone="success" />
        <SummaryChip
          label="Pending gates"
          value={sum.pendingGates}
          tone={sum.pendingGates > 0 ? "warning" : "muted"}
        />
      </div>

      <StageEventList
        events={bucket.events}
        emptyLabel="No events have fired in this stage yet."
      />
    </section>
  );
};

const toneClass: Record<string, string> = {
  accent:  "border-accent bg-accent-tint text-accent-pressed",
  info:    "border-semantic-info bg-semantic-infoTint text-semantic-info",
  success: "border-semantic-success bg-semantic-successTint text-semantic-success",
  warning: "border-semantic-warning bg-semantic-warningTint text-semantic-warning",
  muted:   "border-rule bg-paper-2 text-ink-3",
};

const SummaryChip: React.FC<{
  label: string;
  value: number;
  tone: keyof typeof toneClass;
}> = ({ label, value, tone }) => (
  <div
    className={`flex flex-col items-start gap-0.5 rounded-sm border px-3 py-2 ${toneClass[tone]}`}
  >
    <span className="font-mono text-mono-sm uppercase tracking-wide opacity-80">
      {label}
    </span>
    <span className="font-serif text-h3 font-semi tabular-nums text-ink-1">
      {value}
    </span>
  </div>
);
