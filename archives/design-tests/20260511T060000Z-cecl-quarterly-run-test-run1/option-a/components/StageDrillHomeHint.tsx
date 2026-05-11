import * as React from "react";
import Link from "next/link";

/**
 * Tiny home-page hint that bridges the sparse rail (visible on the
 * home dashboard) to the dense per-stage ledger (only available on
 * the run-detail surface). Server component — display-only.
 */
export const StageDrillHomeHint: React.FC<{ caseId: string }> = ({ caseId }) => (
  <div className="flex items-center justify-between border-b border-rule bg-paper-2 px-6 py-3">
    <p className="text-body-sm text-ink-3">
      Click a stage above to scan its label, owner, and pipeline state.
      Open the run to drill into the dense numeric ledger.
    </p>
    <Link
      href={`/case/${caseId}`}
      className="rounded-sm border border-rule bg-paper px-3 py-1.5 font-mono text-mono-sm text-ink-1 hover:border-accent"
    >
      Open this quarter →
    </Link>
  </div>
);
