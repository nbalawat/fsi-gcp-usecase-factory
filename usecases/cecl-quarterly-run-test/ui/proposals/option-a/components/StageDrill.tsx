"use client";

import * as React from "react";
import { RunStageRail } from "./RunStageRail";
import { SegmentLedger } from "./SegmentLedger";
import type { LedgerRow, RailStage, RailStageId } from "../lib/data";

interface Props {
  stages: readonly RailStage[];
  ledger: readonly LedgerRow[];
  initialStageId: RailStageId;
}

/**
 * Client wrapper that owns the "which stage is expanded" state.
 *
 * The page passes server-computed data (stages, ledger, initial id) and
 * this component handles the click → expand → re-render cycle for the
 * dense ledger. The sparse rail itself remains visible at the top no
 * matter which stage is open.
 */
export const StageDrill: React.FC<Props> = ({
  stages,
  ledger,
  initialStageId,
}) => {
  const [active, setActive] = React.useState<RailStageId>(initialStageId);
  const activeStage = stages.find((s) => s.id === active) ?? stages[0];

  return (
    <>
      <RunStageRail
        stages={stages}
        activeId={active}
        onStageClick={(id) => setActive(id as RailStageId)}
      />

      {/* Sparse caption above the dense ledger — anchors the stage in
          banker vocabulary so the executive never loses context. */}
      <section
        aria-label={`${activeStage.label} ledger`}
        className="border-b border-rule px-6 py-6"
      >
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <div className="eyebrow">{activeStage.owner}</div>
            <h2 className="font-serif text-h2 font-semi text-ink-1">
              {activeStage.label}
            </h2>
            <p className="mt-1 text-body-sm text-ink-3">{activeStage.caption}</p>
          </div>
          <div className="text-right font-mono text-mono-sm text-ink-3">
            <div>
              <span className="text-ink-1 font-medium tabular-nums">
                {activeStage.count}
              </span>{" "}
              {activeStage.countUnit}
            </div>
            <div className="mt-1">stage {stageIndex(stages, active) + 1} of 4</div>
          </div>
        </div>

        <div className="rounded-md border border-rule bg-paper">
          <SegmentLedger stageId={active} ledger={ledger} />
        </div>
      </section>
    </>
  );
};

function stageIndex(stages: readonly RailStage[], id: RailStageId): number {
  return stages.findIndex((s) => s.id === id);
}
