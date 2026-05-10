"use client";

/**
 * Live "your application is being processed" skeleton, shown on the case
 * detail page while the Cloud Workflow is mid-flight (extracting,
 * spreading, drafting). Reads stage from useLiveCase(applicationId) and
 * animates a chip-row that flips green as each pipeline stage completes.
 *
 * Stages map to the Cloud Workflows v3 application_state.current_stage:
 *
 *   intake →
 *     extraction_review (HITL) →
 *     spreading →
 *     rating_review (HITL) →
 *     drafting →
 *     draft_review (HITL) →
 *     approval (HITL) →
 *     posting → done
 *
 * The panel renders nothing once we're past `draft_review` — the right
 * rail's decision summary + the credit memo tab take over.
 *
 * The panel ALSO renders nothing on HITL stages, because the
 * <CheckpointActionBar> at the bottom of the viewport is the actionable
 * surface there; showing both creates redundant chrome.
 */

import * as React from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveCase } from "@/lib/live-stream";
import { cn } from "@/lib/ui";

const STAGES: { id: string; label: string; sub: string }[] = [
  { id: "intake", label: "Application received", sub: "Handler validating + enriching" },
  { id: "extracting", label: "Extracting documents", sub: "Landing AI / LiteParse + Gemini" },
  { id: "spreading", label: "Spreading financials", sub: "Atomic services compute ratios" },
  { id: "rating", label: "Rating + covenant design", sub: "Risk band + maintenance covenants" },
  { id: "drafting", label: "Drafting credit memo", sub: "10-section memo with citations" },
  { id: "approval", label: "Final approval", sub: "Recommendation ready" },
];

const STAGE_ORDER = STAGES.map((s) => s.id);

/** Server stage → UI panel index. HITL stages return -1 so the panel
 *  hides (the action bar handles those). Terminal stages return >=
 *  STAGE_ORDER.length so the panel hides. */
function stageIndex(stage: string | undefined): number {
  if (!stage) return 0;
  // HITL stages: action bar takes over; hide the panel.
  if (
    stage === "extraction_review" ||
    stage === "rating_review" ||
    stage === "draft_review"
  ) {
    return -1;
  }
  // Terminal stages: hide.
  if (stage === "approval" || stage === "posting" || stage === "done") {
    return STAGE_ORDER.length;
  }
  // Map workflow's mid-stage names to UI step ids.
  const aliased =
    stage === "extracting" || stage === "extract" ? "extracting" :
    stage === "spreading" || stage === "scoring" || stage === "policy" || stage === "atomic_services" ? "spreading" :
    stage === "analyzing" ? "spreading" :
    stage === "rating" || stage === "rating_and_covenants" ? "rating" :
    stage === "drafting" || stage === "underwrite" ? "drafting" :
    stage === "reviewing" ? "drafting" :
    stage;
  const idx = STAGE_ORDER.indexOf(aliased);
  return idx === -1 ? 0 : idx;
}

export interface CaseProcessingPanelProps {
  applicationId: string;
  /** Stage from the server-rendered state (avoids initial flash before SSE). */
  initialStage: string;
}

export const CaseProcessingPanel: React.FC<CaseProcessingPanelProps> = ({
  applicationId,
  initialStage,
}) => {
  const { case: live } = useLiveCase(applicationId);
  const stage = live?.current_stage ?? initialStage;
  const idx = stageIndex(stage);

  // Hide on HITL stages (action bar takes over) and on terminal stages
  // (memo + decision rail take over). idx === -1 is HITL, idx >=
  // STAGE_ORDER.length is terminal.
  if (idx === -1 || idx >= STAGE_ORDER.length) return null;

  return (
    <Card className="border-accent/40 bg-paper">
      <CardHeader>
        <CardTitle>Processing your application…</CardTitle>
        <CardDescription>
          Live from the orchestrator. The credit memo will appear here when the
          drafting agent finishes — typically within 60-90 seconds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {STAGES.map((s, i) => {
            const state =
              i < idx ? "done" : i === idx ? "active" : "pending";
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border px-3 py-2 transition-colors",
                  state === "done" && "border-semantic-success/40 bg-semantic-successTint/30",
                  state === "active" && "border-accent/40 bg-accent-tint/40",
                  state === "pending" && "border-rule bg-paper-2/40",
                )}
              >
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  {state === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-semantic-success" />
                  ) : state === "active" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-accent-pressed" />
                  ) : (
                    <span aria-hidden className="h-2 w-2 rounded-full bg-paper-3 ring-1 ring-rule" />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-body-sm",
                      state === "pending" ? "text-ink-3" : "text-ink-1 font-semi",
                    )}
                  >
                    {s.label}
                  </p>
                  <p className="text-body-sm text-ink-3">{s.sub}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 rounded-md border border-rule bg-paper-2/40 px-3 py-2">
          <p className="font-mono text-mono-sm text-ink-3">
            stage: <span className="text-ink-1">{stage}</span> · application{" "}
            <span className="text-ink-1">{applicationId.slice(0, 8)}…</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
