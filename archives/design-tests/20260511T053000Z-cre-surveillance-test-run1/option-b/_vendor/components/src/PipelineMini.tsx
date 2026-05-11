import * as React from "react";
import type { ProcessStep } from "./ProcessFlow";

export interface PipelineMiniProps {
  /** Steps in execution order — same shape as ProcessFlow. */
  steps: ProcessStep[];
  /** Optional context id, displayed in the header. */
  contextId?: string;
}

const stepTone: Record<
  ProcessStep["status"],
  { dot: string; chip: string; label: string }
> = {
  done:    { dot: "bg-semantic-success", chip: "text-semantic-success", label: "done" },
  active:  { dot: "bg-accent",           chip: "text-accent-pressed",   label: "active" },
  pending: { dot: "bg-ink-4",            chip: "text-ink-3",            label: "pending" },
  error:   { dot: "bg-semantic-danger",  chip: "text-semantic-danger",  label: "error" },
};

/**
 * Vertical stack of pipeline steps for narrow side panels (≤ 420px).
 *
 * Each step is a tight row: status dot · label · status chip · note · latency.
 * Used in the homepage right drawer; case detail uses the wide ProcessFlow.
 */
export const PipelineMini: React.FC<PipelineMiniProps> = ({ steps, contextId }) => (
  <section
    aria-label="Pipeline summary"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="flex items-baseline justify-between border-b border-rule px-3 py-2">
      <div>
        <div className="eyebrow">5-step paradigm</div>
        <h3 className="text-h4 font-semi text-ink-1">Pipeline</h3>
      </div>
      {contextId && (
        <span className="font-mono text-mono-sm text-ink-3 truncate max-w-[14rem]">
          {contextId}
        </span>
      )}
    </header>
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const tone = stepTone[s.status];
        return (
          <li
            key={s.kind + i}
            className={`flex items-start gap-3 px-3 py-2.5 ${i < steps.length - 1 ? "border-b border-rule" : ""}`}
          >
            {/* Rail with dot + connector */}
            <div className="relative flex flex-col items-center pt-1">
              <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden />
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="mt-1 w-px flex-1 bg-rule"
                  style={{ minHeight: 18 }}
                />
              )}
            </div>

            {/* Body */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ui font-medium text-ink-1 truncate">
                  {s.label}
                </span>
                <span
                  className={`flex-shrink-0 font-mono text-[10px] uppercase ${tone.chip}`}
                >
                  {tone.label}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-mono-sm text-ink-3">
                {s.parallelism !== undefined && (
                  <span>×{s.parallelism}</span>
                )}
                {s.latencyMs !== undefined && (
                  <span>{s.latencyMs}ms</span>
                )}
                {s.actors && s.actors.length > 0 && (
                  <span className="truncate">
                    {s.actors.slice(0, 2).join(", ")}
                    {s.actors.length > 2 && ` +${s.actors.length - 2}`}
                  </span>
                )}
              </div>
              {s.note && (
                <p className="mt-1 text-caption text-ink-2 leading-snug">
                  {s.note}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  </section>
);
