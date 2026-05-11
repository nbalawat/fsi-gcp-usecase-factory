import * as React from "react";
import { StatusBadge, StepProgress } from "@fsi-bank/components";
import {
  type StageView,
  PIPELINE_EVENTS,
  stageLabel,
  relativeTime,
  latestEvent,
} from "../lib/data";

export interface PipelineSpineProps {
  stages: StageView[];
  /** Hightlight events for this stage (drill-in). */
  focusStageId?: string;
}

/**
 * The pipeline event SPINE — a horizontal, scrollable strip of every
 * recorded PIPELINE_EVENT, grouped by stage, anchored at the top of the
 * page. This is NOT a drawer; this is the page's backbone.
 *
 * Why workflow-first: the user can answer "what happened, what stage, what
 * agent or service was it" at a glance, without leaving the case.
 */
export const PipelineSpine: React.FC<PipelineSpineProps> = ({
  stages,
  focusStageId,
}) => {
  const last = latestEvent();
  const totalDone = stages.filter((s) => s.position === "past").length;
  return (
    <section
      aria-label="Pipeline event spine"
      className="flex flex-col border-b border-rule bg-paper-2"
    >
      <header className="flex items-center justify-between gap-4 border-b border-rule bg-paper px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="eyebrow">Pipeline spine</span>
          <StepProgress
            total={stages.length}
            done={totalDone}
            status={totalDone === stages.length ? "done" : "active"}
            currentLabel={stages.find((s) => s.position === "current")?.id}
          />
        </div>
        <div className="flex items-center gap-3 font-mono text-mono-sm text-ink-3">
          <span>{PIPELINE_EVENTS.length} events</span>
          {last && (
            <>
              <span aria-hidden>·</span>
              <span>last {relativeTime(last.at)}</span>
            </>
          )}
        </div>
      </header>

      <ol className="flex items-stretch gap-2 overflow-x-auto px-6 py-3">
        {stages.map((stage) => (
          <SpineStageColumn
            key={stage.id}
            stage={stage}
            focused={stage.id === focusStageId}
          />
        ))}
      </ol>
    </section>
  );
};

interface SpineStageColumnProps {
  stage: StageView;
  focused: boolean;
}

const SpineStageColumn: React.FC<SpineStageColumnProps> = ({
  stage,
  focused,
}) => {
  const events = filterStageEvents(stage.id);
  const tone =
    stage.position === "current"
      ? "border-accent bg-paper ring-1 ring-accent/30"
      : stage.position === "past"
        ? "border-rule bg-paper"
        : "border-rule bg-paper-2 opacity-70";

  return (
    <li
      id={`spine-${stage.id}`}
      className={`flex min-w-[12rem] flex-shrink-0 flex-col rounded-md border p-2 transition ${tone} ${
        focused ? "ring-2 ring-accent" : ""
      }`}
      aria-current={stage.position === "current" ? "step" : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-ui font-medium text-ink-1">
          {stageLabel(stage.id)}
        </span>
        <StatusBadge
          kind={
            stage.position === "past"
              ? "success"
              : stage.position === "current"
                ? "accent"
                : "neutral"
          }
        >
          {stage.position}
        </StatusBadge>
      </div>
      <div className="mt-1 font-mono text-mono-sm text-ink-3">
        {events.length} event{events.length === 1 ? "" : "s"}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {events.slice(0, 4).map((e, i) => (
          <SpineEvent key={`${stage.id}-${i}`} event={e} />
        ))}
        {events.length > 4 && (
          <li className="font-mono text-mono-sm text-ink-3">
            +{events.length - 4} more
          </li>
        )}
      </ul>
    </li>
  );
};

const SpineEvent: React.FC<{ event: (typeof PIPELINE_EVENTS)[number] }> = ({
  event,
}) => {
  const label = describeEvent(event);
  return (
    <li className="flex items-baseline gap-2 font-mono text-[11px]">
      <span aria-hidden className="text-ink-4 flex-shrink-0">
        ·
      </span>
      <span className="text-ink-2 truncate">{label}</span>
    </li>
  );
};

function describeEvent(e: (typeof PIPELINE_EVENTS)[number]): string {
  switch (e.kind) {
    case "stage_entered":
      return `→ ${("stage" in e && e.stage) || "?"}`;
    case "document_uploaded":
      return `doc ${("doc_type" in e && e.doc_type) || "?"}`;
    case "document_extracted":
      return `extracted ${("doc_type" in e && e.doc_type) || "?"}`;
    case "service_invoked":
      return `svc ${("service" in e && e.service) || "?"}`;
    case "agent_invoked":
      return `agent ${("agent" in e && e.agent) || "?"}`;
    case "human_action_pending":
      return `gate ${("gate" in e && e.gate) || "?"} pending`;
    case "human_action":
      return `${("gate" in e && e.gate) || "?"} → ${("decision" in e && e.decision) || "?"}`;
    default:
      return e.kind;
  }
}

function filterStageEvents(
  stageId: string
): Array<(typeof PIPELINE_EVENTS)[number]> {
  const out: Array<(typeof PIPELINE_EVENTS)[number]> = [];
  let active: string | undefined;
  for (const e of PIPELINE_EVENTS) {
    if (e.kind === "stage_entered" && "stage" in e) {
      active = (e as { stage?: string }).stage;
    }
    if (active === stageId) out.push(e);
  }
  return out;
}
