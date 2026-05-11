"use client";

import * as React from "react";
import { StatusBadge } from "@primitives";
import type { RecommendationRow, Disposition } from "../lib/data";

export interface InlineDispositionRowProps {
  /** The recommendation being dispositioned */
  rec: RecommendationRow;
  /** Where the Send-to-customer button walks once accepted */
  approvalHref: string;
  /** Detail href (read-only deep dive) */
  detailHref: string;
}

/**
 * THE signature affordance of option-C.
 *
 * Disposition lives where the rationale is. Every card carries the
 * 4 inline buttons — Accept (queues for send), Reject (with required
 * short reason), Snooze (24h/7d/30d), Escalate. No modals. No bottom-bar.
 *
 * After Accept, the row collapses to a "Send to customer →" link that
 * walks to /approval/[id], the ONLY irrevocable surface.
 */
export const InlineDispositionRow: React.FC<InlineDispositionRowProps> = ({
  rec,
  approvalHref,
  detailHref,
}) => {
  const [disposition, setDisposition] = React.useState<Disposition>(
    rec.disposition,
  );
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [snoozeOpen, setSnoozeOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const upliftKind = rec.uplift_score >= 85 ? "success" : "neutral";
  const fitKind = rec.fit_score >= 85 ? "accent" : "neutral";
  const regKind = rec.regulatory_clear === "clear" ? "success" : "warning";

  const onAccept = (): void => {
    setDisposition("accepted");
    setRejectOpen(false);
    setSnoozeOpen(false);
  };

  const onSubmitReject = (): void => {
    setTouched(true);
    if (!rejectReason.trim()) return;
    setDisposition("rejected");
    setRejectOpen(false);
  };

  const onSnooze = (window: "24h" | "7d" | "30d"): void => {
    setDisposition(
      window === "24h"
        ? "snoozed-24h"
        : window === "7d"
          ? "snoozed-7d"
          : "snoozed-30d",
    );
    setSnoozeOpen(false);
  };

  const onEscalate = (): void => {
    setDisposition("escalated");
  };

  const reset = (): void => {
    setDisposition("pending");
    setRejectReason("");
    setTouched(false);
  };

  return (
    <article
      aria-label={`Recommendation for ${rec.borrower.name}`}
      className="rounded-md border border-rule bg-paper p-4"
    >
      {/* Header: borrower + scores */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">{rec.id}</div>
          <h3 className="font-serif text-h3 font-semi text-ink-1">
            <a
              href={detailHref}
              className="hover:text-accent-pressed hover:underline"
            >
              {rec.borrower.name}
            </a>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
            <span>{rec.borrower.geo}</span>
            <span>·</span>
            <span>NAICS {rec.borrower.naics}</span>
            <span>·</span>
            <span>band {rec.borrower.risk_band}</span>
            <span>·</span>
            <span>stage: {rec.stage}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind={upliftKind}>
            uplift {rec.uplift_score}
          </StatusBadge>
          <StatusBadge kind={fitKind}>fit {rec.fit_score}</StatusBadge>
          <StatusBadge kind={regKind}>
            reg {rec.regulatory_clear}
          </StatusBadge>
        </div>
      </header>

      {/* Rationale — disposition lives where the rationale is */}
      <p className="mt-3 text-body-sm text-ink-1">{rec.rationale}</p>

      {/* Inline disposition bar */}
      {disposition === "pending" && !rejectOpen && !snoozeOpen && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="rounded-sm bg-accent px-4 py-2 text-ui font-semi text-accent-fg hover:bg-accent-hover"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => setRejectOpen(true)}
            className="rounded-sm border border-semantic-danger px-4 py-2 text-ui font-semi text-semantic-danger hover:bg-semantic-dangerTint"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => setSnoozeOpen(true)}
            className="rounded-sm border border-border-strong px-4 py-2 text-ui font-semi text-ink-1 hover:bg-paper-2"
          >
            Snooze
          </button>
          <button
            type="button"
            onClick={onEscalate}
            className="rounded-sm border border-semantic-warning px-4 py-2 text-ui font-semi text-semantic-warning hover:bg-semantic-warningTint"
          >
            Escalate
          </button>
          <a
            href={detailHref}
            className="ml-auto rounded-sm border border-rule px-3 py-2 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
          >
            See full case →
          </a>
        </div>
      )}

      {/* Inline reject — required short reason */}
      {disposition === "pending" && rejectOpen && (
        <div className="mt-4 rounded-sm border border-semantic-danger bg-semantic-dangerTint p-3">
          <label className="flex flex-col gap-1 text-mono-sm">
            <span className="text-ink-1 font-semi">
              Short reason (required)
            </span>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. customer already has card · not a fit · regulatory clarification needed"
              aria-invalid={touched && !rejectReason.trim() ? true : undefined}
              className="rounded-sm border border-border-strong bg-paper p-2 text-ui text-ink-1 focus:border-semantic-danger focus:outline-none focus:ring-1 focus:ring-semantic-danger"
            />
            {touched && !rejectReason.trim() && (
              <span className="text-mono-sm text-semantic-danger">
                Reason is required.
              </span>
            )}
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onSubmitReject}
              className="rounded-sm bg-semantic-danger px-3 py-1.5 text-mono-sm font-semi text-paper hover:opacity-90"
            >
              Submit reject
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectOpen(false);
                setRejectReason("");
                setTouched(false);
              }}
              className="rounded-sm border border-border-strong px-3 py-1.5 text-mono-sm font-semi text-ink-1 hover:bg-paper-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline snooze — 24h / 7d / 30d windows */}
      {disposition === "pending" && snoozeOpen && (
        <div className="mt-4 rounded-sm border border-rule bg-paper-2 p-3">
          <div className="font-semi text-ui text-ink-1">Snooze window</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSnooze("24h")}
              className="rounded-sm border border-border-strong px-3 py-1.5 text-mono-sm font-semi text-ink-1 hover:bg-paper"
            >
              24 hours
            </button>
            <button
              type="button"
              onClick={() => onSnooze("7d")}
              className="rounded-sm border border-border-strong px-3 py-1.5 text-mono-sm font-semi text-ink-1 hover:bg-paper"
            >
              7 days
            </button>
            <button
              type="button"
              onClick={() => onSnooze("30d")}
              className="rounded-sm border border-border-strong px-3 py-1.5 text-mono-sm font-semi text-ink-1 hover:bg-paper"
            >
              30 days
            </button>
            <button
              type="button"
              onClick={() => setSnoozeOpen(false)}
              className="ml-auto rounded-sm px-3 py-1.5 text-mono-sm font-medium text-ink-3 hover:text-ink-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Post-disposition states */}
      {disposition === "accepted" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-sm border border-accent bg-accent-tint p-3">
          <StatusBadge kind="accent">queued for send</StatusBadge>
          <span className="text-ui text-ink-1">
            Accepted — the only remaining step is the irrevocable send.
          </span>
          <a
            href={approvalHref}
            className="ml-auto rounded-sm bg-brandBlack px-3 py-1.5 text-mono-sm font-semi text-brandBlack-fg hover:bg-ink-2"
          >
            Send to customer →
          </a>
          <button
            type="button"
            onClick={reset}
            className="rounded-sm border border-border-strong px-3 py-1.5 text-mono-sm font-medium text-ink-1 hover:bg-paper"
          >
            Undo
          </button>
        </div>
      )}

      {disposition === "rejected" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-sm border border-semantic-danger bg-semantic-dangerTint p-3">
          <StatusBadge kind="danger">rejected</StatusBadge>
          <span className="text-ui text-ink-1">
            Rejected · reason recorded for analytics.
          </span>
          <button
            type="button"
            onClick={reset}
            className="ml-auto rounded-sm border border-border-strong px-3 py-1.5 text-mono-sm font-medium text-ink-1 hover:bg-paper"
          >
            Undo
          </button>
        </div>
      )}

      {(disposition === "snoozed-24h" ||
        disposition === "snoozed-7d" ||
        disposition === "snoozed-30d") && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-sm border border-rule bg-paper-2 p-3">
          <StatusBadge kind="neutral">
            snoozed ·{" "}
            {disposition === "snoozed-24h"
              ? "24h"
              : disposition === "snoozed-7d"
                ? "7d"
                : "30d"}
          </StatusBadge>
          <span className="text-ui text-ink-1">
            Re-presented after window — analytics tracks snooze-then-accept rate.
          </span>
          <button
            type="button"
            onClick={reset}
            className="ml-auto rounded-sm border border-border-strong px-3 py-1.5 text-mono-sm font-medium text-ink-1 hover:bg-paper"
          >
            Undo
          </button>
        </div>
      )}

      {disposition === "escalated" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-sm border border-semantic-warning bg-semantic-warningTint p-3">
          <StatusBadge kind="warning">escalated</StatusBadge>
          <span className="text-ui text-ink-1">
            Escalated to market manager — re-routed off the RM queue.
          </span>
          <button
            type="button"
            onClick={reset}
            className="ml-auto rounded-sm border border-border-strong px-3 py-1.5 text-mono-sm font-medium text-ink-1 hover:bg-paper"
          >
            Undo
          </button>
        </div>
      )}
    </article>
  );
};
