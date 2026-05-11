"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type {
  SegmentRow as SegmentRowModel,
} from "../lib/data";
import { fmtCurrency, fmtPctBps, fmtPct } from "../lib/data";

export interface SegmentRowProps {
  segment: SegmentRowModel;
  /** Disposition callback — wired to a useState handler in the parent */
  onAction: (segmentId: string, action: "approve" | "variance") => void;
  /** Track which segments have been locally approved this session */
  approvedLocally?: boolean;
  /** Show the inline reasoning expander */
  expanded?: boolean;
  onToggleExpand: (segmentId: string) => void;
}

const verdictBadge = (
  v: SegmentRowModel["verdict"],
  approvedLocally: boolean,
): { kind: "success" | "warning" | "info" | "neutral"; label: string } => {
  if (approvedLocally || v === "approved") {
    return { kind: "success", label: "approved" };
  }
  if (v === "variance") return { kind: "warning", label: "variance" };
  if (v === "queued") return { kind: "neutral", label: "queued" };
  return { kind: "info", label: "ready" };
};

const riskBandColor: Record<SegmentRowModel["riskBand"], string> = {
  "1-pass": "bg-riskBand-1-pass",
  "2-special-mention": "bg-riskBand-2-special-mention",
  "3-substandard": "bg-riskBand-3-substandard",
  "4-doubtful": "bg-riskBand-4-doubtful",
  "5-loss": "bg-riskBand-5-loss",
};

/**
 * One segment of the CECL run. Carries its PD/LGD/EAD/ECL inputs INLINE
 * alongside the action it enables — no separate review screen. The action
 * column is the rightmost cell; the user's eye never has to travel to a
 * sticky bar or a modal to dispose of the row.
 *
 * Verdict drives which action surfaces:
 *   - ready    → "Approve methodology" (reversible)
 *   - variance → "Open variance Q&A"   (reversible)
 *   - queued   → disabled "Waiting for upstream agent"
 *   - approved → "Approved · view methodology" (read-only)
 */
export const SegmentRow: React.FC<SegmentRowProps> = ({
  segment: s,
  onAction,
  approvedLocally = false,
  expanded = false,
  onToggleExpand,
}) => {
  const badge = verdictBadge(s.verdict, approvedLocally);
  const isApproved = approvedLocally || s.verdict === "approved";
  const isVariance = s.verdict === "variance";
  const isQueued = s.verdict === "queued";

  return (
    <article
      data-testid={`segment-row-${s.id}`}
      data-verdict={badge.label}
      className="grid grid-cols-1 gap-3 border-b border-rule px-5 py-4 last:border-b-0 lg:grid-cols-[3px_3fr_2fr_2fr_auto] lg:items-center"
    >
      {/* Risk-band ring (3px gutter at left) */}
      <span
        aria-hidden
        className={`hidden h-full w-[3px] rounded-sm lg:block ${riskBandColor[s.riskBand]}`}
      />

      {/* Identity column — borrower + segment label */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate font-serif text-h3 font-semi text-ink-1">
            {s.borrower.name}
          </h3>
          <StatusBadge kind={badge.kind}>{badge.label}</StatusBadge>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-mono-sm text-ink-3">
          <span>{s.id}</span>
          <span>·</span>
          <span>{s.label}</span>
          <span>·</span>
          <span>{s.borrower.geo}</span>
          <span>·</span>
          <span>NAICS {s.borrower.naics}</span>
        </div>
        {s.varianceReason && (
          <p className="mt-1.5 text-caption text-semantic-warning">
            ⚠ {s.varianceReason}
          </p>
        )}
      </div>

      {/* PD/LGD/EAD inputs — INLINE alongside the action */}
      <dl
        aria-label="CECL inputs"
        className="grid grid-cols-3 gap-2 rounded-sm bg-paper-2 px-3 py-2"
      >
        <div>
          <dt className="text-caption uppercase tracking-wide text-ink-3">PD</dt>
          <dd className="font-mono text-mono font-medium tabular-nums text-ink-1">
            {fmtPctBps(s.inputs.pd_bps)}
          </dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-wide text-ink-3">LGD</dt>
          <dd className="font-mono text-mono font-medium tabular-nums text-ink-1">
            {fmtPct(s.inputs.lgd_pct)}
          </dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-wide text-ink-3">EAD</dt>
          <dd className="font-mono text-mono font-medium tabular-nums text-ink-1">
            {fmtCurrency(s.inputs.ead_usd)}
          </dd>
        </div>
      </dl>

      {/* Computed reserve — the artifact the segment produces */}
      <div className="rounded-sm border border-rule bg-paper px-3 py-2">
        <div className="text-caption uppercase tracking-wide text-ink-3">
          Reserve (ECL)
        </div>
        <div className="font-serif text-h2 font-semi tabular-nums text-ink-1">
          {fmtCurrency(s.inputs.ecl_usd)}
        </div>
        <div className="font-mono text-mono-sm text-ink-3">
          owner: {s.methodologyOwner.split(",")[0]}
        </div>
      </div>

      {/* Inline action — THE PATTERN. Reversible verbs only. CFO
           attestation escapes to /approval. */}
      <div className="flex flex-col items-stretch gap-1.5 lg:items-end">
        {!isApproved && !isVariance && !isQueued && (
          <button
            type="button"
            onClick={() => onAction(s.id, "approve")}
            className="rounded-sm bg-accent px-4 py-2 font-mono text-mono-sm font-medium text-accent-fg hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent-pressed focus:ring-offset-1"
          >
            Approve methodology
          </button>
        )}
        {isVariance && (
          <button
            type="button"
            onClick={() => onAction(s.id, "variance")}
            className="rounded-sm border border-semantic-warning bg-semantic-warning-tint px-4 py-2 font-mono text-mono-sm font-medium text-semantic-warning hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-semantic-warning"
          >
            Open variance Q&amp;A
          </button>
        )}
        {isApproved && (
          <span className="inline-flex items-center justify-center rounded-sm border border-semantic-success bg-semantic-success-tint px-4 py-2 font-mono text-mono-sm font-medium text-semantic-success">
            ✓ Approved
          </span>
        )}
        {isQueued && (
          <span
            aria-disabled
            className="inline-flex items-center justify-center rounded-sm border border-rule bg-paper-2 px-4 py-2 font-mono text-mono-sm text-ink-3"
          >
            Waiting upstream
          </span>
        )}
        <button
          type="button"
          onClick={() => onToggleExpand(s.id)}
          aria-expanded={expanded}
          className="font-mono text-mono-sm text-ink-3 hover:text-ink-1"
        >
          {expanded ? "Hide reasoning" : `Show reasoning (${s.agentHops})`}
        </button>
      </div>

      {/* Inline reasoning expander — opens IN PLACE so the user never
           leaves the row to inspect the agent's work. */}
      {expanded && (
        <div className="col-span-full mt-2 rounded-sm border border-rule bg-paper-2 p-3">
          <div className="eyebrow">Agent reasoning · {s.borrower.name}</div>
          <ul className="mt-2 flex flex-col gap-1.5 text-caption text-ink-2">
            <li>
              <span className="font-mono text-mono-sm text-stageType-agent">
                financial-spreader
              </span>{" "}
              normalized the latest 10-K spread: revenue {fmtCurrency(s.borrower.revenue_usd)},
              risk band <span className="font-mono text-mono-sm">{s.borrower.risk_band}</span>.
            </li>
            <li>
              <span className="font-mono text-mono-sm text-stageType-agent">
                industry-risk-scorer
              </span>{" "}
              scored NAICS {s.borrower.naics} in geo {s.borrower.geo}; PD shifted
              to <span className="font-mono text-mono-sm tabular-nums">{fmtPctBps(s.inputs.pd_bps)}</span>.
            </li>
            <li>
              <span className="font-mono text-mono-sm text-stageType-agent">
                segment-reserve-agent
              </span>{" "}
              composed PD × LGD × EAD = <span className="font-mono text-mono-sm tabular-nums">{fmtCurrency(s.inputs.ecl_usd)}</span>{" "}
              for this segment.
            </li>
          </ul>
        </div>
      )}
    </article>
  );
};
