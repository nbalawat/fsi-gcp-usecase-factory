import * as React from "react";
import { StatusBadge, CaseCard } from "@fsi-bank/components";
import { DispositionButtons } from "./DispositionButtons";
import {
  dispositionBadgeKind,
  dispositionLabel,
  expiryUrgency,
  formatExpiryShort,
  fmtUsdCompact,
  type Recommendation,
} from "../lib/data";

export interface RecRowProps {
  rec: Recommendation;
}

const expiryClass: Record<"critical" | "soon" | "ok", string> = {
  critical: "text-status-critical",
  soon: "text-status-warning",
  ok: "text-ink-3",
};

/**
 * One row in the dense queue. The row IS a complete unit — the seed
 * says "no click-through needed for triage". The borrower / action /
 * rationale / confidence / expiry / disposition buttons all live on
 * this single line.
 *
 * The CaseCard shared primitive carries the borrower identity column
 * (left). The remaining columns are inline; the disposition buttons
 * at the far right close the loop.
 */
export const RecRow: React.FC<RecRowProps> = ({ rec }) => {
  const urgency = expiryUrgency(rec.expiresAt);
  const expiryShort = formatExpiryShort(rec.expiresAt);
  const detailHref = `/case/${rec.id}`;
  const sendHref = `/approval/${rec.id}`;

  return (
    <li
      className="grid grid-cols-[16rem_1fr_5rem_5rem_5rem_auto] items-center gap-3 border-b border-rule px-3 py-2 hover:bg-paper-2"
      data-testid={`rec-row-${rec.id}`}
      data-disposition={rec.disposition}
      data-urgency={urgency}
    >
      {/* Column 1 — borrower (CaseCard, compact view) */}
      <div className="min-w-0">
        <CaseCard
          id={rec.borrower.id}
          borrowerId={rec.borrower.id}
          borrowerName={rec.borrower.name}
          stage={rec.disposition}
          riskBand={rec.borrower.risk_band as Recommendation["borrower"]["risk_band"]}
          conf={rec.confidence}
          view="compact"
        />
      </div>

      {/* Column 2 — recommended action + one-line rationale */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <a
            href={detailHref}
            className="truncate text-ui font-semi text-ink-1 hover:underline"
          >
            {rec.actionLabel}
          </a>
          {!rec.regulatoryClear && (
            <StatusBadge kind="warning">reg watch</StatusBadge>
          )}
        </div>
        <p className="mt-0.5 truncate text-body-sm text-ink-3" title={rec.rationale}>
          {rec.rationale}
        </p>
      </div>

      {/* Column 3 — confidence */}
      <div className="text-right">
        <div className="font-mono text-ui font-semi tabular-nums text-ink-1">
          {(rec.confidence * 100).toFixed(0)}%
        </div>
        <div className="eyebrow">conf</div>
      </div>

      {/* Column 4 — annualised uplift */}
      <div className="text-right">
        <div className="font-mono text-ui font-semi tabular-nums text-ink-1">
          {fmtUsdCompact(rec.upliftUsd)}
        </div>
        <div className="eyebrow">uplift / yr</div>
      </div>

      {/* Column 5 — expiry */}
      <div className="text-right">
        <div
          className={`font-mono text-ui font-semi tabular-nums ${expiryClass[urgency]}`}
        >
          {expiryShort}
        </div>
        <div className="eyebrow">expires</div>
      </div>

      {/* Column 6 — disposition badge + inline buttons */}
      <div className="flex items-center justify-end gap-2">
        <StatusBadge kind={dispositionBadgeKind(rec.disposition)}>
          {dispositionLabel(rec.disposition)}
        </StatusBadge>
        <DispositionButtons
          recId={rec.id}
          disposition={rec.disposition}
          sendHref={sendHref}
          detailHref={detailHref}
        />
      </div>
    </li>
  );
};
