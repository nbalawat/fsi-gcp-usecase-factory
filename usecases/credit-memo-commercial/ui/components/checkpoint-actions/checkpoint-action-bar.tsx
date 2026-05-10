"use client";

/**
 * CheckpointActionBar — sticky bar at the top of the case detail page
 * that surfaces the human action required RIGHT NOW. Shape switches
 * based on application_state.current_stage:
 *
 *   extraction_review → "Approve all extractions" + "Fix specific fields"
 *   rating_review     → "Approve rating" + risk-band override selector
 *   draft_review      → "Approve draft" + "Edit memo" (opens editor)
 *   approval          → "Approve" / "Decline" / "Return to applicant"
 *
 * Each action POSTs to /api/applications/<id>/callback/<checkpoint>
 * which forwards to the workflow's await_callback URL.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/ui";

type Checkpoint =
  | "extraction_review"
  | "rating_review"
  | "draft_review"
  | "final_approval";

interface Props {
  applicationId: string;
  currentStage: string;
  riskBand?: string | null;
  /** Names of checkpoints that have a workflow callback URL registered.
   *  When the action bar's checkpoint isn't in this set, we render
   *  nothing — the workflow may have been cancelled or already advanced
   *  past this state, so showing "Action required" would be misleading. */
  pendingCheckpoints?: string[];
  className?: string;
  /** When provided, refreshes the case page after a successful callback. */
  onAfterAction?: () => void;
}

const CURRENT_STAGE_TO_CHECKPOINT: Record<string, Checkpoint | null> = {
  extraction_review: "extraction_review",
  rating_review: "rating_review",
  draft_review: "draft_review",
  approval: "final_approval",
};

const RISK_BANDS = [
  "1-pass",
  "2-special-mention",
  "3-substandard",
  "4-doubtful",
  "5-loss",
] as const;

export function CheckpointActionBar({
  applicationId,
  currentStage,
  riskBand,
  pendingCheckpoints,
  className,
  onAfterAction,
}: Props): React.ReactElement | null {
  const checkpoint = CURRENT_STAGE_TO_CHECKPOINT[currentStage];
  if (!checkpoint) return null;
  // If we know the registered callback set and our checkpoint isn't in
  // it, the workflow isn't actually paused here — render nothing so the
  // banker doesn't see a phantom "Action required" prompt.
  if (
    Array.isArray(pendingCheckpoints) &&
    !pendingCheckpoints.includes(checkpoint)
  ) {
    return null;
  }

  return (
    <aside
      className={cn(
        "sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-amber-300 bg-amber-50/70 px-4 py-3 shadow-sm",
        className,
      )}
      aria-label="Pending human action"
    >
      <div className="flex items-baseline gap-3">
        <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">
          Action required
        </span>
        <span className="text-sm font-medium text-amber-900">
          {LABELS[checkpoint]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {checkpoint === "extraction_review" && (
          <ExtractionActions applicationId={applicationId} onDone={onAfterAction} />
        )}
        {checkpoint === "rating_review" && (
          <RatingActions
            applicationId={applicationId}
            currentBand={riskBand ?? null}
            onDone={onAfterAction}
          />
        )}
        {checkpoint === "draft_review" && (
          <DraftActions applicationId={applicationId} onDone={onAfterAction} />
        )}
        {checkpoint === "final_approval" && (
          <ApprovalActions applicationId={applicationId} onDone={onAfterAction} />
        )}
      </div>
    </aside>
  );
}

const LABELS: Record<Checkpoint, string> = {
  extraction_review: "Review per-document extractions before underwriting begins",
  rating_review: "Review the proposed risk band before the memo is drafted",
  draft_review: "Review the drafted credit memo (you may edit it inline)",
  final_approval: "Final approval — approve, decline, or return to applicant",
};

// ─── Helper: POST to callback ───────────────────────────────────────────────

interface CallbackResult {
  /** true = workflow accepted the decision; false = real error to show. */
  ok: boolean;
  /** true = the workflow had already advanced past this checkpoint when
   *  we tried (404 with no_pending_callback). Treated as success: the
   *  user's intent is satisfied; we just need to refresh the view. */
  alreadyAdvanced?: boolean;
  error?: string;
}

async function postCallback(
  applicationId: string,
  checkpoint: Checkpoint,
  body: Record<string, unknown>,
): Promise<CallbackResult> {
  const r = await fetch(`/api/applications/${applicationId}/callback/${checkpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (r.status === 404) {
    // The workflow already moved past this checkpoint (or it's never
    // been registered for this app). User's earlier click probably
    // succeeded; we just need to refresh.
    return { ok: true, alreadyAdvanced: true };
  }
  if (!r.ok) {
    try {
      const parsed = JSON.parse(text) as { error?: string };
      return { ok: false, error: parsed.error ?? text };
    } catch {
      return { ok: false, error: text };
    }
  }
  return { ok: true };
}

/**
 * Wraps a callback action with the standard UX:
 *   - while pending: setBusy(label)
 *   - on success: show "✓ Submitted — workflow advancing…" for ~4s,
 *     then router.refresh() so the page re-fetches state
 *   - on real error: surface the message
 *   - on "already advanced": same as success, with a slightly softer
 *     copy ("Workflow already moved on — reloading…")
 *
 * The success-state lingers briefly so the user gets confirmation
 * BEFORE the page swaps to the next stage; without it, the bar would
 * jump straight to the next "Action required" pill and feel like the
 * click didn't register.
 */
function useCheckpointAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ message: string } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (
      label: string,
      action: () => Promise<CallbackResult>,
    ): Promise<void> => {
      setBusy(label);
      setErr(null);
      setDone(null);
      const r = await action();
      if (!r.ok) {
        setBusy(null);
        setErr(r.error ?? "Failed");
        return;
      }
      setBusy(null);
      setDone({
        message: r.alreadyAdvanced
          ? "Workflow already advanced — reloading…"
          : "✓ Submitted — workflow advancing…",
      });
      // Give the user 600ms to see the confirmation, then refresh the
      // RSC tree. The page re-fetches application_state and renders the
      // next stage's bar (or hides it on terminal stages).
      setTimeout(() => {
        router.refresh();
        // Clear the local "done" state shortly after refresh so if the
        // user is somehow still on this stage, they see the action
        // controls again.
        setTimeout(() => setDone(null), 1500);
      }, 600);
    },
    [router],
  );

  return { busy, done, err, run };
}

// ─── Per-checkpoint action sets ─────────────────────────────────────────────

function ExtractionActions({
  applicationId,
}: {
  applicationId: string;
  onDone?: () => void;
}): React.ReactElement {
  const { busy, done, err, run } = useCheckpointAction();

  function approve() {
    void run("approve", () =>
      postCallback(applicationId, "extraction_review", { decision: "approve" }),
    );
  }

  if (done) return <DoneChip message={done.message} />;

  return (
    <>
      <button
        type="button"
        disabled={busy !== null}
        onClick={approve}
        className="rounded-md bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy === "approve" ? "Approving…" : "Approve all extractions"}
      </button>
      <span className="text-xs text-amber-800">
        Use the per-document panel below to fix specific fields if needed.
      </span>
      {err && <p className="w-full text-xs text-rose-700">{err}</p>}
    </>
  );
}

/** Confirmation chip rendered in place of the action buttons after a
 *  successful callback. Stays visible while router.refresh() pulls the
 *  next state. */
function DoneChip({ message }: { message: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-900 ring-1 ring-emerald-300">
      <span aria-hidden>✓</span>
      {message}
    </span>
  );
}

function RatingActions({
  applicationId,
  currentBand,
}: {
  applicationId: string;
  currentBand: string | null;
  onDone?: () => void;
}): React.ReactElement {
  const { busy, done, err, run } = useCheckpointAction();
  const [override, setOverride] = React.useState<string>(currentBand ?? "");

  function approve() {
    void run("approve", () =>
      postCallback(applicationId, "rating_review", { decision: "approve" }),
    );
  }
  function applyOverride() {
    if (!override) return;
    void run("override", () =>
      postCallback(applicationId, "rating_review", {
        decision: "override",
        new_risk_band: override,
      }),
    );
  }

  if (done) return <DoneChip message={done.message} />;

  return (
    <>
      <span className="text-xs text-amber-900">
        Proposed band: <strong>{currentBand ?? "—"}</strong>
      </span>
      <select
        className="rounded-md border border-amber-300 bg-white px-2 py-1 text-sm"
        value={override}
        onChange={(e) => setOverride(e.target.value)}
        disabled={busy !== null}
      >
        <option value="">Override to…</option>
        {RISK_BANDS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy !== null || !override || override === currentBand}
        onClick={applyOverride}
        className="rounded-md border border-amber-700 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-40"
      >
        {busy === "override" ? "Overriding…" : "Apply override"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={approve}
        className="rounded-md bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy === "approve" ? "Approving…" : "Approve rating"}
      </button>
      {err && <p className="w-full text-xs text-rose-700">{err}</p>}
    </>
  );
}

function DraftActions({
  applicationId,
  onDone,
}: {
  applicationId: string;
  onDone?: () => void;
}): React.ReactElement {
  const { busy, done, err, run } = useCheckpointAction();

  function approve() {
    void run("approve", () =>
      postCallback(applicationId, "draft_review", { decision: "approve" }),
    );
  }

  if (done) return <DoneChip message={done.message} />;

  return (
    <>
      <span className="text-xs text-amber-800">
        Review the memo below. Inline edits open a draft editor (coming soon).
      </span>
      <button
        type="button"
        disabled={busy !== null}
        onClick={approve}
        className="rounded-md bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy === "approve" ? "Approving…" : "Approve draft as-is"}
      </button>
      {err && <p className="w-full text-xs text-rose-700">{err}</p>}
    </>
  );
}

function ApprovalActions({
  applicationId,
}: {
  applicationId: string;
  onDone?: () => void;
}): React.ReactElement {
  const { busy, done, err, run } = useCheckpointAction();

  function send(decision: "APPROVE" | "DECLINE" | "RETURN_FOR_REVISION") {
    void run(decision, () =>
      postCallback(applicationId, "final_approval", { decision }),
    );
  }

  if (done) return <DoneChip message={done.message} />;

  return (
    <>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => send("APPROVE")}
        className="rounded-md bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy === "APPROVE" ? "Approving…" : "Approve"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => send("DECLINE")}
        className="rounded-md bg-rose-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-rose-800 disabled:opacity-50"
      >
        {busy === "DECLINE" ? "Declining…" : "Decline"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => send("RETURN_FOR_REVISION")}
        className="rounded-md border border-amber-700 bg-white px-4 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-40"
      >
        {busy === "RETURN_FOR_REVISION" ? "Returning…" : "Return to applicant"}
      </button>
      {err && <p className="w-full text-xs text-rose-700">{err}</p>}
    </>
  );
}
