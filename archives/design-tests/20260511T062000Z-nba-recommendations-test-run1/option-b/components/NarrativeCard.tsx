import * as React from "react";
import { CaseCard } from "./primitives";
import { CustomerTimeline } from "./CustomerTimeline";
import { EvidenceChips } from "./EvidenceChips";
import type { Recommendation, Customer } from "../lib/data";

/**
 * UC-OWNED component — the heart of option B.
 *
 * Each card is one customer relationship's STORY: the agent's narrative,
 * the relationship's recent activity timeline, the proposed action, the
 * impact, and the evidence chips that support the story. The RM reads
 * stories, not data tables.
 *
 * Built on top of the shared CaseCard primitive (chrome + urgency border).
 */
export interface NarrativeCardProps {
  rec: Recommendation;
  customer: Customer;
  /** Compact mode shows headline + story only — used for lower-urgency tiles */
  compact?: boolean;
  /** Optional Disposition slot rendered at the bottom (the ApprovalGate
   *  primitive in the case-detail view; omitted in the queue view) */
  disposition?: React.ReactNode;
  /** If set, the card title is a link to the case detail page. */
  caseHref?: string;
}

const fmtMoney = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export const NarrativeCard: React.FC<NarrativeCardProps> = ({
  rec,
  customer,
  compact = false,
  disposition,
  caseHref,
}) => {
  return (
    <CaseCard
      id={rec.id}
      customerName={rec.headline}
      size={`${customer.industry} · ${customer.geo} · ${fmtMoney(customer.exposure_usd)} exposure`}
      urgency={rec.urgency}
      typeLabel={rec.typeLabel}
      draftedAt={rec.draftedAt}
      href={caseHref}
      view="detail"
    >
      <p className="font-serif text-ui leading-relaxed text-ink-1">
        {rec.story}
      </p>

      {!compact && (
        <CustomerTimeline events={rec.timeline} />
      )}

      <div className="grid grid-cols-1 gap-3 rounded-md border border-rule bg-paper-2 p-3 md:grid-cols-3">
        <div>
          <div className="eyebrow">Proposed</div>
          <div className="font-serif text-ui text-ink-1">{rec.proposal}</div>
          <div className="mt-1 font-mono text-mono-sm text-ink-2 tabular-nums">
            {rec.proposalSize}
          </div>
        </div>
        <div>
          <div className="eyebrow">Impact</div>
          <div className="font-serif text-ui text-ink-1">{rec.impact}</div>
        </div>
        <div>
          <div className="eyebrow">Routes to</div>
          <div className="font-serif text-ui text-ink-1">{rec.routeTo}</div>
          <div className="mt-1 font-mono text-mono-sm text-ink-3">
            Authority: {rec.approvalAuthority}
          </div>
        </div>
      </div>

      <EvidenceChips chips={rec.evidence} confidence={rec.confidence} />

      {disposition}
    </CaseCard>
  );
};
