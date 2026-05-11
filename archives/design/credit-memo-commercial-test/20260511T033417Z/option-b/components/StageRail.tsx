import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import {
  type StageView,
  stageLabel,
  relativeTime,
  gateLabel,
  gateDecision,
} from "../lib/data";

export interface StageRailProps {
  stages: StageView[];
  /** Where each rail entry links to. The current and past stages on the
   *  case page link back to the case detail; the rail on the approval
   *  page links forward into the approval flow when a gate exists. */
  caseId: string;
  /** Mode controls where rail entries link to. */
  mode?: "case" | "approval";
}

/**
 * Left rail — past stages compress to status pills, current is highlighted,
 * future stages are dimmed but visible. Each entry is a real <a> with href.
 * Pure presentational; data is shaped by `lib/data.ts` (no math here).
 */
export const StageRail: React.FC<StageRailProps> = ({
  stages,
  caseId,
  mode = "case",
}) => {
  return (
    <aside
      aria-label="Workflow stages"
      className="flex flex-col gap-1 border-r border-rule bg-paper-2 p-3"
    >
      <div className="eyebrow px-2 pb-1">Workflow</div>
      <ol className="flex flex-col">
        {stages.map((s, i) => (
          <StageRailItem
            key={s.id}
            stage={s}
            caseId={caseId}
            isLast={i === stages.length - 1}
            mode={mode}
          />
        ))}
      </ol>
    </aside>
  );
};

interface StageRailItemProps {
  stage: StageView;
  caseId: string;
  isLast: boolean;
  mode: "case" | "approval";
}

const StageRailItem: React.FC<StageRailItemProps> = ({
  stage,
  caseId,
  isLast,
  mode,
}) => {
  const decision = stage.gate ? gateDecision(stage.gate) : undefined;
  const pos = stage.position;

  // Each rail entry is a real anchor so it has a clickable affordance.
  // - Past stages link back to the case detail anchored at the stage.
  // - The current stage on case page links to its own anchor; on approval
  //   page, if a gate exists, link to that gate section.
  // - Future stages link to the case detail (read-only preview).
  const href =
    mode === "approval" && stage.gate
      ? `/approval/${caseId}#gate-${stage.gate}`
      : `/case/${caseId}#stage-${stage.id}`;

  const containerCls =
    pos === "current"
      ? "bg-paper border-accent ring-2 ring-accent/30"
      : pos === "past"
        ? "bg-paper border-rule hover:border-accent/40"
        : "bg-paper-2 border-rule opacity-60 hover:opacity-90";

  const indexCls =
    pos === "current"
      ? "bg-accent text-paper"
      : pos === "past"
        ? "bg-semantic-success text-paper"
        : "bg-paper-3 text-ink-3";

  return (
    <li className="relative">
      <a
        href={href}
        aria-current={pos === "current" ? "step" : undefined}
        className={`group flex items-start gap-2 rounded-md border p-2 transition ${containerCls}`}
      >
        <span
          aria-hidden
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${indexCls}`}
        >
          {stage.index + 1}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-ui font-medium text-ink-1 truncate">
            {stageLabel(stage.id)}
          </span>
          <span className="font-mono text-mono-sm text-ink-3 truncate">
            {stage.enteredAt ? relativeTime(stage.enteredAt) : "not entered"}
          </span>
          {stage.gate && (
            <span className="mt-1">
              <StatusBadge
                kind={
                  decision?.decision === "approve"
                    ? "success"
                    : pos === "current"
                      ? "accent"
                      : "neutral"
                }
              >
                {gateLabel(stage.gate)}
                {decision ? ` · ${decision.decision}` : ""}
              </StatusBadge>
            </span>
          )}
        </span>
      </a>
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[18px] top-[34px] h-3 w-px bg-rule"
        />
      )}
    </li>
  );
};
