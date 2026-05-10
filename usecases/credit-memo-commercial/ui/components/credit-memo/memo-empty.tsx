"use client";

/**
 * Empty state for the credit memo — the case has no memo yet.
 *
 * Surfaces what the workflow is ACTUALLY doing right now (current
 * stage, time-elapsed, link to the live pipeline activity) so the
 * banker doesn't see a static "60-90s" message and wonder if anything
 * is happening. The previous version was identical regardless of
 * whether the workflow had just started or had been running for 5
 * minutes — that gave the right impression that the page was stuck.
 */

import * as React from "react";
import { FileText, Loader2 } from "lucide-react";

interface Props {
  /** application_state.current_stage — drives the live status line. */
  currentStage?: string | null;
  /** application_state.stage_entered_at ISO timestamp — drives the
   *  "in this stage for N seconds" indicator. */
  stageEnteredAt?: string | null;
  /** Optional click-to-jump callback that switches the case-tabbed
   *  shell to the "How it was built" tab so the banker can watch the
   *  pipeline-activity stream live. */
  onShowPipeline?: () => void;
}

const STAGE_LABEL: Record<string, string> = {
  intake: "Receiving the application",
  extracting: "Extracting documents (Landing AI / Gemini)",
  extraction_review: "Awaiting your extraction review",
  spreading: "Spreading financials (atomic services running)",
  analyzing: "Analyst agent synthesizing 7-section analysis",
  rating: "Rating + designing covenants",
  rating_review: "Awaiting your rating review",
  drafting: "Drafting the credit memo (drafter agent active)",
  reviewing: "Reviewer agent critiquing the draft",
  draft_review: "Awaiting your draft review",
  approval: "Awaiting your final approval",
  posting: "Posting to GL + document store",
  done: "Closed",
};

export const MemoEmpty: React.FC<Props> = ({
  currentStage,
  stageEnteredAt,
  onShowPipeline,
}) => {
  // Tick the in-stage seconds counter every 5s so the banker sees the
  // page is alive while the workflow is mid-run.
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const id = setInterval(force, 5000);
    return () => clearInterval(id);
  }, []);

  const stageLabel = currentStage
    ? STAGE_LABEL[currentStage] ?? `Stage: ${currentStage}`
    : "Workflow starting…";

  let inStageSec: number | null = null;
  if (stageEnteredAt) {
    const ms = Date.now() - new Date(stageEnteredAt).getTime();
    if (ms > 0) inStageSec = Math.round(ms / 1000);
  }

  // Map HITL stage → which tab the action lives on, so we can route
  // the user directly there from the empty state. Documents tab for
  // extraction review; "Credit memo" stays on memo with the inline
  // sticky action bar that we already render at the bottom.
  const HITL_TAB_HINT: Record<string, { tab: string; help: string }> = {
    extraction_review: {
      tab: "Documents",
      help: "Review what was extracted from each PDF, then click 'Approve all extractions' in the action bar at the bottom.",
    },
    rating_review: {
      tab: "Credit memo",
      help: "Approve the proposed risk band (or override) in the action bar at the bottom.",
    },
    draft_review: {
      tab: "Credit memo",
      help: "Read the drafted memo, then click 'Approve draft as-is' in the action bar at the bottom.",
    },
    approval: {
      tab: "Credit memo",
      help: "Final approval — Approve / Decline / Return in the action bar at the bottom.",
    },
  };
  const hitlHint = currentStage ? HITL_TAB_HINT[currentStage] : undefined;
  const isHitl = !!hitlHint;

  return (
    <div className="rounded-lg border border-border bg-paper p-10 text-center">
      {isHitl ? (
        <FileText
          className="mx-auto h-9 w-9 text-muted-foreground/70"
          aria-hidden
          strokeWidth={1.5}
        />
      ) : (
        <Loader2
          className="mx-auto h-9 w-9 animate-spin text-accent"
          aria-hidden
        />
      )}
      <h3 className="mt-4 font-serif text-h3 font-semi text-foreground">
        {isHitl ? "Awaiting your action" : "Workflow in progress"}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-body-sm text-muted-foreground leading-snug">
        {stageLabel}
        {inStageSec !== null ? (
          <>
            {" "}
            <span className="font-mono text-mono-sm">
              · {inStageSec}s in this stage
            </span>
          </>
        ) : null}
      </p>
      {hitlHint ? (
        <p className="mx-auto mt-3 max-w-md rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-body-sm text-amber-900">
          {hitlHint.help}
        </p>
      ) : (
        <p className="mt-3 font-mono text-mono-sm text-muted-foreground">
          Typical end-to-end: ~3 minutes from upload to drafted memo
        </p>
      )}
      {onShowPipeline ? (
        <button
          type="button"
          onClick={onShowPipeline}
          className="mt-5 rounded-md border border-rule bg-paper px-3 py-1.5 text-body-sm text-ink-2 hover:border-accent hover:text-accent"
        >
          See pipeline activity →
        </button>
      ) : null}
    </div>
  );
};
