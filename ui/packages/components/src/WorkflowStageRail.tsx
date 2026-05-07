import * as React from "react";

export type StageType = "agent" | "human" | "mixed" | "auto";

export interface Stage {
  id: string;
  name: string;
  type: StageType;
  count: number;
  /** SLO budget in hours for the stage */
  slo?: number;
  /** Stuck count — cases past SLA in this stage */
  stuckCount?: number;
}

export interface WorkflowStageRailProps {
  stages: Stage[];
  /** Stage id to highlight as the current/focused one */
  currentStage?: string;
  onStageClick?: (stageId: string) => void;
}

const typeBadge: Record<StageType, { label: string; classes: string }> = {
  agent: {
    label: "agent",
    classes: "bg-stageType-agent/10 text-stageType-agent",
  },
  human: {
    label: "human",
    classes: "bg-stageType-human/10 text-stageType-human",
  },
  mixed: {
    label: "mixed",
    classes: "bg-stageType-mixed/10 text-stageType-mixed",
  },
  auto: {
    label: "auto",
    classes: "bg-stageType-auto/10 text-stageType-auto",
  },
};

/**
 * Horizontal rail of stages. The pipeline canvas's left-to-right flow.
 *
 * Active stage is visually emphasised. Stuck cases get a small badge.
 * Click → caller scrolls / navigates (no internal state).
 */
export const WorkflowStageRail: React.FC<WorkflowStageRailProps> = ({
  stages,
  currentStage,
  onStageClick,
}) => {
  return (
    <div
      role="list"
      aria-label="Pipeline stages"
      className="flex items-stretch gap-2 overflow-x-auto border-b border-surface-border bg-surface-panel px-6 py-4"
    >
      {stages.map((s, i) => {
        const isCurrent = s.id === currentStage;
        const isLast = i === stages.length - 1;
        const badge = typeBadge[s.type];
        return (
          <React.Fragment key={s.id}>
            <button
              type="button"
              role="listitem"
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => onStageClick?.(s.id)}
              className={[
                "flex min-w-[10rem] flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition",
                isCurrent
                  ? "border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/40"
                  : "border-surface-border bg-surface-panel hover:border-brand-primary/60",
              ].join(" ")}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">
                  {s.name}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${badge.classes}`}
                >
                  {badge.label}
                </span>
              </div>
              <div className="flex w-full items-center justify-between text-xs">
                <span className="tabular-nums text-text-secondary">
                  {s.count} {s.count === 1 ? "case" : "cases"}
                </span>
                {s.slo !== undefined && (
                  <span className="text-text-muted">SLO {s.slo}h</span>
                )}
              </div>
              {s.stuckCount !== undefined && s.stuckCount > 0 && (
                <span className="rounded bg-status-criticalBg px-1.5 py-0.5 text-[10px] font-semibold text-status-critical">
                  {s.stuckCount} stuck
                </span>
              )}
            </button>
            {!isLast && (
              <div
                aria-hidden
                className="self-center text-text-muted"
              >
                →
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
