"use client";

import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@fsi-bank/components";
import { SegmentRow } from "./SegmentRow";
import type { SegmentRow as SegmentRowModel } from "../lib/data";
import { fmtCurrency } from "../lib/data";

export interface RunOverviewClientProps {
  segments: SegmentRowModel[];
  runId: string;
  /** Total ECL across all segments (display-only) */
  totalEcl: number;
  /** Approval-flow href for the CFO attestation escape */
  approvalHref: string;
  /** Number of HITL gates the canvas requires */
  hitlGateCount: number;
}

/**
 * The run overview — segment rows are the page. Each row carries its
 * inline action (the affordance pattern). The user never opens a modal or
 * a bottom-bar to dispose of a segment. The ONLY action that escapes
 * inline is CFO attestation, which is irrevocable and lives on /approval.
 *
 * Client component because:
 *   - Local approval state must be tracked per session (banker may approve
 *     several segments, then hop to /approval for CFO sign-off)
 *   - Inline reasoning expander uses useState
 *   - "Variance Q&A" inline form uses useState
 */
export const RunOverviewClient: React.FC<RunOverviewClientProps> = ({
  segments,
  runId,
  totalEcl,
  approvalHref,
  hitlGateCount,
}) => {
  const [approved, setApproved] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [varianceQa, setVarianceQa] = React.useState<{
    segmentId: string;
    note: string;
  } | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const onAction = (segmentId: string, action: "approve" | "variance"): void => {
    if (action === "approve") {
      setApproved((prev) => {
        const next = new Set(prev);
        next.add(segmentId);
        return next;
      });
      setToast(`Approved methodology for ${segmentId} · reversible until CFO attest`);
      window.setTimeout(() => setToast(null), 2400);
      return;
    }
    if (action === "variance") {
      setVarianceQa({ segmentId, note: "" });
    }
  };

  const onToggleExpand = (segmentId: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) next.delete(segmentId);
      else next.add(segmentId);
      return next;
    });
  };

  const sessionApprovedCount = approved.size;
  const allReadyApproved = segments
    .filter((s) => s.verdict === "ready")
    .every((s) => approved.has(s.id));
  const canAttest = allReadyApproved && segments.length > 0;

  return (
    <section
      aria-label="Segment run overview"
      className="flex flex-col bg-paper"
    >
      {/* Run-level header strip — totals + CFO escape */}
      <header
        aria-label="Run summary"
        className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule bg-paper px-6 py-4"
      >
        <div>
          <div className="eyebrow">Q2 CECL run · {runId}</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-serif text-h1 font-semi tabular-nums text-ink-1">
              {fmtCurrency(totalEcl)}
            </span>
            <span className="font-mono text-mono-sm text-ink-3">
              proposed allowance · {segments.length} segments · {hitlGateCount} HITL gates
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge
            kind={sessionApprovedCount > 0 ? "accent" : "neutral"}
          >
            {sessionApprovedCount} approved this session
          </StatusBadge>
          <Link
            href={approvalHref}
            aria-disabled={!canAttest}
            className={[
              "rounded-sm border px-4 py-2 font-mono text-mono-sm font-medium transition",
              canAttest
                ? "border-brandBlack bg-brandBlack text-brandBlack-fg hover:bg-ink-2"
                : "border-rule bg-paper-2 text-ink-3 pointer-events-none",
            ].join(" ")}
          >
            CFO attest run →
          </Link>
        </div>
      </header>

      {/* Segment rows — the page IS the list */}
      <div className="flex flex-col">
        {segments.map((s) => (
          <SegmentRow
            key={s.id}
            segment={s}
            onAction={onAction}
            approvedLocally={approved.has(s.id)}
            expanded={expanded.has(s.id)}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>

      {/* Inline variance Q&A panel — opens BENEATH the rows (in-page, not
           modal) so the segment row that triggered it stays visible. */}
      {varianceQa && (
        <section
          aria-label="Variance Q&A"
          className="border-t border-rule bg-semantic-warning-tint px-6 py-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="eyebrow">Variance Q&amp;A · {varianceQa.segmentId}</div>
              <h3 className="font-serif text-h3 font-semi text-ink-1">
                Methodology owner is asking
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setVarianceQa(null)}
              className="font-mono text-mono-sm text-ink-3 hover:text-ink-1"
            >
              Dismiss
            </button>
          </div>
          <p className="mt-2 max-w-2xl text-body-sm text-ink-2">
            The PD delta on this segment exceeds the canvas-set tolerance.
            Document the rationale below — your response is appended to the
            audit log and the segment returns to <em>ready</em>. Reversible.
          </p>
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setApproved((prev) => {
                const next = new Set(prev);
                next.add(varianceQa.segmentId);
                return next;
              });
              setToast(
                `Variance Q&A logged for ${varianceQa.segmentId} · segment marked ready`,
              );
              window.setTimeout(() => setToast(null), 2400);
              setVarianceQa(null);
            }}
          >
            <textarea
              value={varianceQa.note}
              onChange={(e) =>
                setVarianceQa({ ...varianceQa, note: e.target.value })
              }
              required
              rows={3}
              placeholder="Rationale for accepting the PD delta this quarter…"
              className="w-full rounded-sm border border-border bg-paper p-2 font-sans text-body-sm text-ink-1 focus:border-accent focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-sm bg-brandBlack px-4 py-2 font-mono text-mono-sm font-medium text-brandBlack-fg hover:bg-ink-2"
              >
                Log rationale and return to ready
              </button>
              <button
                type="button"
                onClick={() => setVarianceQa(null)}
                className="rounded-sm border border-rule px-4 py-2 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Toast — confirms reversible actions without stealing focus */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-10 max-w-sm rounded-sm border border-semantic-success bg-semantic-success-tint px-4 py-2 font-mono text-mono-sm text-semantic-success shadow"
        >
          {toast}
        </div>
      )}
    </section>
  );
};
