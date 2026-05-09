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
  className,
  onAfterAction,
}: Props): React.ReactElement | null {
  const checkpoint = CURRENT_STAGE_TO_CHECKPOINT[currentStage];
  if (!checkpoint) return null;

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

async function postCallback(
  applicationId: string,
  checkpoint: Checkpoint,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/applications/${applicationId}/callback/${checkpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
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

// ─── Per-checkpoint action sets ─────────────────────────────────────────────

function ExtractionActions({
  applicationId,
  onDone,
}: {
  applicationId: string;
  onDone?: () => void;
}): React.ReactElement {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function approve() {
    setBusy("approve");
    setErr(null);
    const r = await postCallback(applicationId, "extraction_review", {
      decision: "approve",
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? "Failed");
      return;
    }
    onDone?.();
  }

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

function RatingActions({
  applicationId,
  currentBand,
  onDone,
}: {
  applicationId: string;
  currentBand: string | null;
  onDone?: () => void;
}): React.ReactElement {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [override, setOverride] = React.useState<string>(currentBand ?? "");
  const [err, setErr] = React.useState<string | null>(null);

  async function approve() {
    setBusy("approve");
    setErr(null);
    const r = await postCallback(applicationId, "rating_review", { decision: "approve" });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? "Failed");
      return;
    }
    onDone?.();
  }

  async function applyOverride() {
    if (!override) return;
    setBusy("override");
    setErr(null);
    const r = await postCallback(applicationId, "rating_review", {
      decision: "override",
      new_risk_band: override,
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? "Failed");
      return;
    }
    onDone?.();
  }

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
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function approve() {
    setBusy("approve");
    setErr(null);
    const r = await postCallback(applicationId, "draft_review", { decision: "approve" });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? "Failed");
      return;
    }
    onDone?.();
  }

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
  onDone,
}: {
  applicationId: string;
  onDone?: () => void;
}): React.ReactElement {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function send(decision: "APPROVE" | "DECLINE" | "RETURN_FOR_REVISION") {
    setBusy(decision);
    setErr(null);
    const r = await postCallback(applicationId, "final_approval", {
      decision,
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? "Failed");
      return;
    }
    onDone?.();
  }

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
