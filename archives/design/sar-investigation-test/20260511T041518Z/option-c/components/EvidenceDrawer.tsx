"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { Citation } from "../lib/data";

export interface EvidenceDrawerProps {
  /** Selected citation, or null if nothing is open */
  citation: Citation | null;
  onClose: () => void;
}

const KIND_BADGE: Record<Citation["kind"], "info" | "success" | "warning" | "neutral"> = {
  transaction: "warning",
  account:     "neutral",
  geography:   "warning",
  agent:       "info",
  rule:        "neutral",
  service:     "success",
};

/**
 * Right-rail drawer that surfaces the source evidence for whichever
 * citation chip the analyst just clicked. Sticky position means the
 * narrative stays visible while the analyst reads the evidence -
 * "the eye never leaves the narrative" (option C's design seed).
 *
 * Pure presentation - takes a resolved citation or null.
 */
export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  citation,
  onClose,
}) => {
  if (!citation) {
    return (
      <aside
        aria-label="Evidence drawer"
        className="sticky top-4 flex flex-col rounded-md border border-rule bg-paper p-4"
      >
        <div className="eyebrow">Evidence</div>
        <h3 className="text-h4 font-semi text-ink-1">No citation selected</h3>
        <p className="mt-2 text-caption text-ink-3">
          Click any [TXN], [GEO], [AGT], [SVC] or [RUL] chip inside the
          narrative to see the underlying record here.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-caption text-ink-3">
          <li>TXN - transaction record</li>
          <li>ACC - account history</li>
          <li>GEO - geography signal</li>
          <li>AGT - agent reasoning</li>
          <li>SVC - atomic-service output</li>
          <li>RUL - rules-engine verdict</li>
        </ul>
      </aside>
    );
  }

  return (
    <aside
      aria-label={`Evidence: ${citation.title}`}
      aria-live="polite"
      className="sticky top-4 flex flex-col rounded-md border border-rule bg-paper"
    >
      <header className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <div className="eyebrow">{citation.kind} evidence</div>
          <h3 className="truncate text-h4 font-semi text-ink-1">
            {citation.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close evidence drawer"
          className="rounded-sm border border-rule bg-paper px-2 py-0.5 font-mono text-mono-sm text-ink-2 hover:bg-paper-2"
        >
          close
        </button>
      </header>
      <div className="flex flex-col gap-3 px-4 py-3">
        <StatusBadge kind={KIND_BADGE[citation.kind]}>
          {citation.kind}
        </StatusBadge>
        <p className="text-ui text-ink-1">{citation.body}</p>
        {citation.fields && citation.fields.length > 0 && (
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-sm border border-rule bg-paper-2 p-2">
            {citation.fields.map((f) => (
              <React.Fragment key={f.k}>
                <dt className="font-mono text-mono-sm text-ink-3">{f.k}</dt>
                <dd className="font-mono text-mono-sm text-ink-1 tabular-nums">
                  {f.v}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        )}
        {citation.eventIdx !== undefined && (
          <p className="text-caption text-ink-3">
            Backed by event #{citation.eventIdx} on the case spine.
          </p>
        )}
      </div>
    </aside>
  );
};
