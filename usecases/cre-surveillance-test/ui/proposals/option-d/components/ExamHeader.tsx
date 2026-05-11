import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { CaseRecord } from "../lib/data";

export interface ExamHeaderProps {
  /** Banker-readable case record (the facility under examination). */
  c: CaseRecord;
  /** Subtitle, e.g. "Facility audit · Examiner view". */
  subtitle: string;
  /** Right-aligned action — usually "Begin examination" / "Open booking flow". */
  actionLabel?: string;
  actionHref?: string;
  /** Banker-readable run identifier (e.g. workflow run-id). */
  runId?: string;
}

/**
 * Cover-page header for an OCC-examiner-style audit. Renders the facility
 * identity at top — the rest of the page reads as the exam findings.
 *
 * Server component (no interactivity).
 */
export const ExamHeader: React.FC<ExamHeaderProps> = ({
  c,
  subtitle,
  actionLabel,
  actionHref,
  runId,
}) => (
  <header className="border-b border-rule bg-paper px-6 py-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="eyebrow">Facility under examination</div>
        <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
          {c.title}
        </h1>
        <p className="mt-2 max-w-2xl text-body-sm text-ink-3">{subtitle}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-mono-sm md:grid-cols-4">
          <div>
            <span className="eyebrow block">Facility ID</span>
            <span className="font-mono text-ink-1">{c.id}</span>
          </div>
          <div>
            <span className="eyebrow block">Borrower</span>
            <span className="font-mono text-ink-1">{c.borrower.name}</span>
          </div>
          <div>
            <span className="eyebrow block">Region · NAICS</span>
            <span className="font-mono text-ink-1">
              {c.borrower.geo} · {c.borrower.naics}
            </span>
          </div>
          <div>
            <span className="eyebrow block">OCC risk band</span>
            <span className="font-mono text-ink-1">{c.borrower.risk_band}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <StatusBadge kind="info">stage: {c.current_stage}</StatusBadge>
        <StatusBadge
          kind={c.decision === "approve" ? "success" : "neutral"}
        >
          recommendation: {c.decision}
        </StatusBadge>
        {runId && (
          <span className="font-mono text-mono-sm text-ink-3">
            run · {runId}
          </span>
        )}
        {actionHref && actionLabel && (
          <a
            href={actionHref}
            className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-ink-1 hover:bg-accent-hover"
          >
            {actionLabel} →
          </a>
        )}
      </div>
    </div>
  </header>
);
