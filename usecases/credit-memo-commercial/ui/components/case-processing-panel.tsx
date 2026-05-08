"use client";

/**
 * Live "your application is being processed" skeleton, shown on the case
 * detail page until the orchestrator advances past `drafting`. Reads stage
 * from useLiveCase(applicationId) and animates a chip-row that flips green
 * as each pipeline stage completes.
 *
 * Stages mirror application_state.current_stage:
 *
 *   intake → spreading → policy → drafting → approval → posting → done
 *
 * The panel renders nothing once we're past `drafting` — at that point the
 * full credit-memo summary on the parent page has the real claim.
 */

import * as React from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveCase } from "@/lib/live-stream";
import { cn } from "@/lib/ui";

const STAGES: { id: string; label: string; sub: string }[] = [
  { id: "intake", label: "Application received", sub: "Handler validating + enriching" },
  { id: "spreading", label: "Spreading financials", sub: "DSCR, leverage, ratios" },
  { id: "scoring", label: "Policy & limits", sub: "Single-borrower, peer percentile" },
  { id: "underwrite", label: "Drafting credit memo", sub: "Supervisor + 13 specialist agents" },
  { id: "approval", label: "Awaiting your decision", sub: "Recommendation ready" },
];

const STAGE_ORDER = STAGES.map((s) => s.id);

function stageIndex(stage: string | undefined): number {
  if (!stage) return 0;
  // Map server's `policy` to UI's `scoring`, `drafting` to `underwrite`.
  // Terminal stages (approval, posting, done) collapse to "past last" so
  // the panel hides — the credit memo + decision rail take over.
  if (stage === "approval" || stage === "posting" || stage === "done") {
    return STAGE_ORDER.length; // == 5, ≥ 4 → panel returns null
  }
  const aliased =
    stage === "policy" ? "scoring" : stage === "drafting" ? "underwrite" : stage;
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

  // Hide once we're at approval or beyond — the parent page's memo summary
  // takes over.
  if (idx >= 4) return null;

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
