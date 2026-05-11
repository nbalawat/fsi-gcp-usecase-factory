import * as React from "react";

export type StepStatus = "done" | "active" | "pending" | "error";

/** The 5-step paradigm anchored in the bank's CLAUDE.md:
 *    handler → atomic services → rules → agent → sinks
 *
 * Plus the source event at the front. Same shape for every use case;
 * the labels and the per-step `parallelism` differ.
 */
export interface ProcessStep {
  /** "handler" | "atomic-services" | "rules" | "agent" | "sinks" */
  kind: "source" | "handler" | "atomic-services" | "rules" | "agent" | "sinks";
  /** Display label */
  label: string;
  /** Status — drives color */
  status: StepStatus;
  /** Number of parallel actors at this step (e.g. 8 atomic services) */
  parallelism?: number;
  /** Names of sub-actors — short list, shown beneath the step */
  actors?: string[];
  /** Latency for the step in ms (when status=done) */
  latencyMs?: number;
  /** Optional one-line note (e.g. "DSCR=1.99 · risk band 3") */
  note?: string;
}

export interface ProcessFlowProps {
  /** Title shown as eyebrow + h-row */
  title?: string;
  steps: ProcessStep[];
  /** Optional context id displayed in the header */
  contextId?: string;
}

const stepTone: Record<
  StepStatus,
  { dot: string; ring: string; chip: string; bg: string; bdr: string }
> = {
  done:    { dot: "bg-semantic-success", ring: "ring-semantic-successTint", chip: "text-semantic-success", bg: "bg-semantic-successTint/40", bdr: "border-rule" },
  active:  { dot: "bg-accent",           ring: "ring-accent/60",            chip: "text-accent-pressed",   bg: "bg-accent-tint",            bdr: "border-accent" },
  pending: { dot: "bg-ink-4",            ring: "ring-rule",                 chip: "text-ink-3",            bg: "bg-paper-2",                bdr: "border-rule" },
  error:   { dot: "bg-semantic-danger",  ring: "ring-semantic-dangerTint",  chip: "text-semantic-danger",  bg: "bg-semantic-dangerTint",    bdr: "border-semantic-danger" },
};

const kindIcon: Record<ProcessStep["kind"], string> = {
  source: "○",        // event
  handler: "▢",       // single service
  "atomic-services": "▤", // parallel fan-out
  rules: "◇",         // decision diamond
  agent: "◐",         // partial-fill — agent reasoning
  sinks: "▷",         // outflow
};

/**
 * The 5-step paradigm rail with live status per step.
 *
 * Used on the homepage as a portfolio-wide view, and on case pages with
 * status set per-execution. Keep this data-driven — never hardcode the
 * five-step shape outside this component.
 */
export const ProcessFlow: React.FC<ProcessFlowProps> = ({
  title,
  steps,
  contextId,
}) => {
  return (
    <section
      aria-label="Process flow"
      className="rounded-md border border-rule bg-paper p-4"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="eyebrow">5-step paradigm</div>
          <h3 className="font-serif text-h3 font-semi text-ink-1">
            {title ?? "Pipeline execution"}
          </h3>
        </div>
        {contextId && (
          <span className="font-mono text-mono-sm text-ink-3">
            ctx · {contextId}
          </span>
        )}
      </header>

      <ol
        className="flex items-stretch gap-2 overflow-x-auto"
        aria-label="Pipeline steps"
      >
        {steps.map((s, i) => (
          <React.Fragment key={s.kind + i}>
            <li className="min-w-[10rem] flex-1">
              <Step step={s} />
            </li>
            {i < steps.length - 1 && (
              <li
                aria-hidden
                className="flex flex-shrink-0 items-center px-0.5 text-ink-3"
              >
                <span className="font-mono text-ui">→</span>
              </li>
            )}
          </React.Fragment>
        ))}
      </ol>
    </section>
  );
};

const Step: React.FC<{ step: ProcessStep }> = ({ step }) => {
  const t = stepTone[step.status];
  return (
    <article
      className={`flex h-full flex-col gap-1 rounded-md border ${t.bdr} ${t.bg} p-3 ring-1 ${t.ring}`}
    >
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          className="font-mono text-ui text-ink-2"
          title={step.kind}
        >
          {kindIcon[step.kind]}
        </span>
        <span className="text-ui font-medium text-ink-1">{step.label}</span>
        <span className="ml-auto flex items-center gap-1 font-mono text-[10px] uppercase">
          <span className={`status-dot ${t.dot}`} aria-hidden />
          <span className={t.chip}>{step.status}</span>
        </span>
      </header>

      {step.parallelism !== undefined && (
        <div className="font-mono text-mono-sm text-ink-3">
          {step.parallelism} parallel
        </div>
      )}

      {step.latencyMs !== undefined && (
        <div className="font-mono text-mono-sm text-ink-3">
          {step.latencyMs}ms
        </div>
      )}

      {step.note && (
        <p className="text-caption text-ink-2 leading-snug">{step.note}</p>
      )}

      {step.actors && step.actors.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1 border-t border-rule pt-2">
          {step.actors.slice(0, 4).map((a) => (
            <li
              key={a}
              className="rounded-sm bg-paper-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
            >
              {a}
            </li>
          ))}
          {step.actors.length > 4 && (
            <li className="rounded-sm bg-paper-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
              +{step.actors.length - 4}
            </li>
          )}
        </ul>
      )}
    </article>
  );
};
