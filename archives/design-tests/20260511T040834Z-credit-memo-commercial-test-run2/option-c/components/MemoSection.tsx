import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import { EvidenceList } from "./EvidenceList";
import type { SectionState } from "../lib/data";

const statusBadge = (s: SectionState["status"]): "success" | "warning" | "neutral" => {
  if (s === "completed") return "success";
  if (s === "pending") return "warning";
  return "neutral";
};

const statusLabel: Record<SectionState["status"], string> = {
  completed: "closed",
  pending: "awaiting",
  queued: "queued",
};

export interface MemoSectionProps {
  section: SectionState;
  /** Rendered as the section's footer — the inline affordance row.
   *  Passed in by the page (server) so the page controls when the
   *  client island lights up. */
  affordance?: React.ReactNode;
  /** Optional sidebar slot inside the section body (e.g. for the final
   *  section's rule-verdict panel). Renders to the right of the
   *  evidence list on lg+ screens. */
  sidebar?: React.ReactNode;
  /** Children rendered ABOVE the evidence list (e.g. the borrower
   *  fact-sheet inside the borrower section). */
  children?: React.ReactNode;
}

/**
 * One section of the memo. Server component (no interactivity).
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │ §  Section title              [status badge]           │  ← header
 *   │    blurb · what this section is for                    │
 *   ├────────────────────────────────────────────────────────┤
 *   │ children (optional, e.g. borrower fact-sheet)          │
 *   ├────────────────────────────────────────────────────────┤
 *   │ evidence list                       │   sidebar slot   │  ← body
 *   ├────────────────────────────────────────────────────────┤
 *   │ AFFORDANCE ROW (inline, no sticky bar)                 │  ← footer
 *   └────────────────────────────────────────────────────────┘
 */
export const MemoSection: React.FC<MemoSectionProps> = ({
  section,
  affordance,
  sidebar,
  children,
}) => {
  return (
    <section
      id={`section-${section.id}`}
      data-section-id={section.id}
      data-section-status={section.status}
      aria-label={section.title}
      className="rounded-md border border-rule bg-paper"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <div className="eyebrow">{section.gate ?? "no HITL gate"}</div>
          <h2 className="font-serif text-lg font-semibold text-ink-1">
            {section.title}
          </h2>
          <p className="mt-0.5 text-caption text-ink-3">{section.blurb}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge kind={statusBadge(section.status)}>
            {statusLabel[section.status]}
          </StatusBadge>
          {section.decision && (
            <StatusBadge
              kind={
                section.decision === "approve"
                  ? "success"
                  : section.decision === "reject"
                    ? "danger"
                    : "neutral"
              }
            >
              {section.decision}
            </StatusBadge>
          )}
        </div>
      </header>

      {children && (
        <div className="border-b border-rule px-4 py-3">{children}</div>
      )}

      <div className={sidebar ? "grid grid-cols-1 gap-0 lg:grid-cols-[1fr_18rem]" : ""}>
        <EvidenceList rows={section.evidence} />
        {sidebar && (
          <aside className="border-t border-rule px-4 py-3 lg:border-l lg:border-t-0">
            {sidebar}
          </aside>
        )}
      </div>

      {affordance}
    </section>
  );
};
