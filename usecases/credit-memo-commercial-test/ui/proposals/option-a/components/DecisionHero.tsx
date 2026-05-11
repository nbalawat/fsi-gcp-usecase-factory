import * as React from "react";

export interface DecisionHeroProps {
  decision: string;
  rationale: string;
  modelProvider: string;
  pageCount: number;
  extractionConfidence: number;
}

const decisionTone: Record<
  string,
  { color: string; bg: string; border: string }
> = {
  approve: {
    color: "text-semantic-success",
    bg: "bg-semantic-successTint",
    border: "border-semantic-success/30",
  },
  decline: {
    color: "text-semantic-danger",
    bg: "bg-semantic-dangerTint",
    border: "border-semantic-danger/30",
  },
  refer: {
    color: "text-semantic-warning",
    bg: "bg-semantic-warningTint",
    border: "border-semantic-warning/30",
  },
};

/**
 * THE artifact of the page. Single hero block: 9rem-tall decision word,
 * a 2-line rationale, and a footer of provenance facts. Nothing else.
 * Executive reads this in 5 seconds and decides whether to descend.
 */
export const DecisionHero: React.FC<DecisionHeroProps> = ({
  decision,
  rationale,
  modelProvider,
  pageCount,
  extractionConfidence,
}) => {
  const tone = decisionTone[decision] ?? decisionTone.refer!;
  const confPct = Math.round(extractionConfidence * 100);
  return (
    <section
      aria-label="Recommended decision"
      className={`rounded-lg border ${tone.border} ${tone.bg} px-10 py-12`}
    >
      <div className="eyebrow text-ink-3">Recommendation</div>
      <div
        className={`mt-2 font-serif text-[96px] leading-none font-semi uppercase tracking-tight ${tone.color}`}
      >
        {decision}
      </div>
      <p className="mt-6 max-w-2xl text-h4 font-serif text-ink-1 leading-snug">
        {rationale}
      </p>
      <dl className="mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-2 font-mono text-mono-sm text-ink-3">
        <div className="flex items-baseline gap-2">
          <dt>Model</dt>
          <dd className="text-ink-1">{modelProvider}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt>Pages reviewed</dt>
          <dd className="text-ink-1 tabular-nums">{pageCount}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt>Extraction conf.</dt>
          <dd className="text-ink-1 tabular-nums">{confPct}%</dd>
        </div>
      </dl>
    </section>
  );
};
