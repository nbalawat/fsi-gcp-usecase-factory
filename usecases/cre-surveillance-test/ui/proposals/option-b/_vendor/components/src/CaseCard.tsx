"use client";

import * as React from "react";

export type RiskBand =
  | "1-pass"
  | "2-special-mention"
  | "3-substandard"
  | "4-doubtful"
  | "5-loss";

export interface CaseCardProps {
  id: string;
  borrowerId: string;
  borrowerName?: string;
  /** Stage id the case is currently in */
  stage: string;
  riskBand?: RiskBand;
  /** Debt-service coverage ratio (base) */
  dscr?: number;
  /** Loan amount in USD */
  loanAmountUsd?: number;
  /** Agent confidence 0..1 */
  conf?: number;
  /** Soft alert text — shown as a small badge if set */
  alert?: string;
  /** When the case entered the current stage */
  stageEnteredAt?: string;
  /** Stuck (past 150% of SLO) */
  stuck?: boolean;
  onClick?: () => void;
  /** Render in compact mode (column-friendly) vs detail mode */
  view?: "compact" | "detail";
}

const riskBandClass: Record<RiskBand, string> = {
  "1-pass":
    "bg-riskBand-1-pass/15 text-riskBand-1-pass border-riskBand-1-pass/30",
  "2-special-mention":
    "bg-riskBand-2-special-mention/15 text-riskBand-2-special-mention border-riskBand-2-special-mention/30",
  "3-substandard":
    "bg-riskBand-3-substandard/15 text-riskBand-3-substandard border-riskBand-3-substandard/30",
  "4-doubtful":
    "bg-riskBand-4-doubtful/15 text-riskBand-4-doubtful border-riskBand-4-doubtful/30",
  "5-loss":
    "bg-riskBand-5-loss/15 text-riskBand-5-loss border-riskBand-5-loss/30",
};

const fmtCurrency = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * One case in a stage column. Click → opens the full case-detail surface.
 */
export const CaseCard: React.FC<CaseCardProps> = ({
  id,
  borrowerId,
  borrowerName,
  stage,
  riskBand,
  dscr,
  loanAmountUsd,
  conf,
  alert,
  stageEnteredAt,
  stuck,
  onClick,
  view = "compact",
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`case-card-${id}`}
      data-stuck={stuck ? "true" : "false"}
      className={[
        "group flex w-full flex-col gap-2 rounded-md border bg-surface-panel p-3 text-left transition",
        stuck
          ? "border-status-critical/60 ring-1 ring-status-critical/40"
          : "border-surface-border hover:border-brand-primary/60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-primary">
            {borrowerName ?? borrowerId}
          </div>
          <div className="truncate font-mono text-[11px] text-text-muted">
            {id}
          </div>
        </div>
        {riskBand && (
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${riskBandClass[riskBand]}`}
          >
            {riskBand}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {loanAmountUsd !== undefined && (
          <div>
            <div className="text-text-muted">Amount</div>
            <div className="font-semibold tabular-nums text-text-primary">
              {fmtCurrency(loanAmountUsd)}
            </div>
          </div>
        )}
        {dscr !== undefined && (
          <div>
            <div className="text-text-muted">DSCR</div>
            <div className="font-semibold tabular-nums text-text-primary">
              {dscr.toFixed(2)}x
            </div>
          </div>
        )}
        {conf !== undefined && (
          <div>
            <div className="text-text-muted">Agent conf.</div>
            <div className="font-semibold tabular-nums text-text-primary">
              {(conf * 100).toFixed(0)}%
            </div>
          </div>
        )}
        <div>
          <div className="text-text-muted">Stage</div>
          <div className="font-semibold text-text-primary">{stage}</div>
        </div>
      </div>

      {(alert || stuck) && (
        <div className="flex flex-wrap gap-1">
          {stuck && (
            <span className="rounded bg-status-criticalBg px-1.5 py-0.5 text-[10px] font-semibold text-status-critical">
              Stuck &gt; SLA
            </span>
          )}
          {alert && (
            <span className="rounded bg-status-warningBg px-1.5 py-0.5 text-[10px] font-semibold text-status-warning">
              {alert}
            </span>
          )}
        </div>
      )}

      {view === "detail" && stageEnteredAt && (
        <div className="text-[11px] text-text-muted">
          In stage since {stageEnteredAt}
        </div>
      )}
    </button>
  );
};
