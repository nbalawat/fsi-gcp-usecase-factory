"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  WorkflowStageRail,
  type Stage,
  type StageType,
} from "@fsi-bank/components";
import type { RailStage, StageStatus } from "../lib/data";

/**
 * Run-stage rail — wraps the shared <WorkflowStageRail> primitive (the
 * pipeline canvas's horizontal stage rail, repurposed here as the
 * executive's "see the whole run at a glance" surface).
 *
 * Click → either calls the optional onStageClick prop (when the page
 * owns expansion state, e.g. the run-detail surface) or navigates to
 * the run-detail surface anchored to that stage (when used on the
 * home dashboard). Inline functions are NOT accepted from Server
 * pages — pass the caseId instead and we'll route via next/navigation.
 */
interface Props {
  stages: readonly RailStage[];
  activeId: string;
  /** Run id to navigate to when no onStageClick is supplied. */
  navigateCaseId?: string;
  /** Owned by Client parents only. */
  onStageClick?: (id: string) => void;
}

const TYPE_MAP: Record<RailStage["type"], StageType> = {
  agent: "agent",
  human: "human",
  mixed: "mixed",
};

// Translate our run-stage status into the shared primitive's stage shape.
// The shared component doesn't model "done/active/pending" directly —
// it surfaces a count + stuckCount. We map "stuck" to exceptions in stage 3
// so the executive sees the only operational signal that matters at this
// zoom level.
function toStage(rs: RailStage, exceptionStuck: number): Stage {
  return {
    id: rs.id,
    name: rs.shortLabel,
    type: TYPE_MAP[rs.type],
    count: rs.count,
    slo: rs.id === "cfo_attestation" ? 24 : undefined,
    stuckCount: rs.id === "exception_review" ? exceptionStuck : undefined,
  };
}

export const RunStageRail: React.FC<Props> = ({
  stages,
  activeId,
  navigateCaseId,
  onStageClick,
}) => {
  const router = useRouter();
  const exc = stages.find((s) => s.id === "exception_review");
  const exceptionStuck = exc ? exc.count : 0;
  const railStages = stages.map((s) => toStage(s, exceptionStuck));

  const handle = (id: string): void => {
    if (onStageClick) {
      onStageClick(id);
    } else if (navigateCaseId) {
      router.push(`/case/${navigateCaseId}#${id}`);
    }
  };

  return (
    <WorkflowStageRail
      stages={railStages}
      currentStage={activeId}
      onStageClick={handle}
    />
  );
};

/**
 * Static (non-interactive) annotation row that sits BELOW the rail.
 * One column per stage; each cell echoes the owner + caption + status
 * pill so the executive sees who owns each step without clicking.
 * Server component — display-only.
 */
export const RailAnnotations: React.FC<{ stages: readonly RailStage[] }> = ({
  stages,
}) => {
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-rule px-6 py-3 md:grid-cols-4">
      {stages.map((s) => (
        <div key={s.id} className="flex flex-col gap-1">
          <span className="eyebrow">{s.owner}</span>
          <span className="text-ui text-ink-2 leading-snug">{s.caption}</span>
          <span className="font-mono text-mono-sm text-ink-3">
            {statusLabel(s.status)}
          </span>
        </div>
      ))}
    </div>
  );
};

function statusLabel(s: StageStatus): string {
  if (s === "done") return "✓ complete";
  if (s === "active") return "● in progress";
  if (s === "pending") return "○ waiting";
  return "· queued";
}
