import * as React from "react";

export interface ReasoningFactor {
  name: string;
  weight: number;       // 0..1
  evidence: string;
  source: string;
  band?: "ok" | "warning" | "critical";
}

export interface AgentReasoningPanelProps {
  /** The reasoning chain step this panel represents (extractor, rater, drafter) */
  step?: string;
  factors: ReasoningFactor[];
  /** Overall agent confidence 0..1 */
  confidence: number;
  /** Citation density 0..1 (per drafter standard, must be >= 0.8) */
  citationDensity?: number;
  /** Optional rationale paragraph */
  rationale?: string;
}

const bandTone: Record<NonNullable<ReasoningFactor["band"]>, string> = {
  ok: "bg-status-okBg text-status-ok",
  warning: "bg-status-warningBg text-status-warning",
  critical: "bg-status-criticalBg text-status-critical",
};

const bar = (value: number): string => {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return `${pct}%`;
};

/**
 * Drills into an agent's output for the selected case: factor breakdown,
 * confidence, citation density. Pure presentation — no fetching here.
 */
export const AgentReasoningPanel: React.FC<AgentReasoningPanelProps> = ({
  step,
  factors,
  confidence,
  citationDensity,
  rationale,
}) => {
  const citationOk = citationDensity === undefined || citationDensity >= 0.8;
  return (
    <section
      aria-label="Agent reasoning"
      className="flex flex-col gap-4 rounded-md border border-surface-border bg-surface-panel p-4"
    >
      <header className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Agent reasoning {step ? `· ${step}` : ""}
          </h3>
          {rationale && (
            <p className="mt-1 text-sm text-text-primary">{rationale}</p>
          )}
        </div>
        <div className="flex gap-3 text-xs">
          <div className="text-right">
            <div className="text-text-muted">Confidence</div>
            <div className="font-semibold tabular-nums text-text-primary">
              {bar(confidence)}
            </div>
          </div>
          {citationDensity !== undefined && (
            <div className="text-right">
              <div className="text-text-muted">Citation density</div>
              <div
                className={`font-semibold tabular-nums ${
                  citationOk ? "text-status-ok" : "text-status-critical"
                }`}
              >
                {bar(citationDensity)}
              </div>
            </div>
          )}
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        {factors.map((f) => (
          <li
            key={f.name}
            className="rounded border border-surface-border bg-surface-panelMuted p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-primary">
                {f.name}
              </span>
              <div className="flex items-center gap-2">
                {f.band && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${bandTone[f.band]}`}
                  >
                    {f.band}
                  </span>
                )}
                <span className="font-mono text-xs tabular-nums text-text-muted">
                  w {f.weight.toFixed(2)}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-text-secondary">{f.evidence}</p>
            <div className="mt-1 font-mono text-[10px] text-text-muted">
              source: {f.source}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
