import * as React from "react";
import {
  TIER1_CAPITAL_USD,
  SINGLE_BORROWER_HARD_LIMIT_PCT,
  SINGLE_BORROWER_WATCH_PCT,
} from "@/lib/bank-config";
import type { BorrowerExposure } from "../../lib/portfolio-data";
import { Badge } from "@/components/ui/badge";

interface Props {
  borrowers: BorrowerExposure[];
  /** Optional preview overlay (used by the what-if simulation). */
  proposed?: { borrower_id: string; amount_usd: number } | null;
}

const fmtFull = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "standard",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * 12 CFR 32 single-borrower meter — the headline regulatory chart for the
 * CCO. Top 5 borrowers by exposure as horizontal bars vs Tier 1 capital,
 * with the watch (10%) and ceiling (15%) lines marked.
 */
export const SingleBorrowerMeter: React.FC<Props> = ({ borrowers, proposed }) => {
  const top = [...borrowers]
    .map((b) => ({
      ...b,
      committed_usd:
        proposed && proposed.borrower_id === b.borrower_id
          ? b.committed_usd + proposed.amount_usd
          : b.committed_usd,
    }))
    .sort((a, b) => b.committed_usd - a.committed_usd)
    .slice(0, 5);

  if (top.length === 0) {
    return (
      <p className="rounded-md border border-rule bg-paper-2 px-4 py-6 text-center text-body-sm text-ink-3">
        No active facilities yet — single-borrower meter populates once the first
        loan is booked.
      </p>
    );
  }

  // Scale so the ceiling sits at ~85% of width, leaving headroom for breach.
  const maxScale = TIER1_CAPITAL_USD * (SINGLE_BORROWER_HARD_LIMIT_PCT / 100) * 1.18;

  return (
    <div className="flex flex-col gap-4">
      {/* Tier 1 baseline */}
      <div className="flex items-center justify-between text-mono-sm text-ink-3">
        <span>Top 5 single-borrower exposures vs Tier 1 capital</span>
        <span>
          12 CFR 32 ceiling: {SINGLE_BORROWER_HARD_LIMIT_PCT}% ·{" "}
          {fmtFull(TIER1_CAPITAL_USD * (SINGLE_BORROWER_HARD_LIMIT_PCT / 100))}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {top.map((b) => {
          const pct = (b.committed_usd / TIER1_CAPITAL_USD) * 100;
          const widthPct = Math.min(100, (b.committed_usd / maxScale) * 100);
          const tone =
            pct >= SINGLE_BORROWER_HARD_LIMIT_PCT
              ? "danger"
              : pct >= SINGLE_BORROWER_WATCH_PCT
                ? "warning"
                : "neutral";
          const barColor =
            tone === "danger"
              ? "bg-semantic-danger"
              : tone === "warning"
                ? "bg-semantic-warning"
                : "bg-accent";
          const isProposed =
            proposed && proposed.borrower_id === b.borrower_id;
          return (
            <div key={b.borrower_id} className="flex items-center gap-3">
              <div className="w-44 flex-shrink-0 truncate">
                <p className="truncate text-body-sm font-semi text-ink-1">
                  {b.legal_name}
                </p>
                <p className="truncate font-mono text-mono-sm text-ink-3">
                  {b.naics_code ?? "—"} · {b.primary_state ?? "?"}
                </p>
              </div>
              <div className="relative h-7 flex-1 overflow-hidden rounded-sm border border-rule bg-paper-2">
                {/* Watch line */}
                <span
                  aria-hidden
                  className="absolute top-0 z-10 h-full border-l border-dashed border-semantic-warning/60"
                  style={{
                    left: `${(SINGLE_BORROWER_WATCH_PCT / SINGLE_BORROWER_HARD_LIMIT_PCT) * (100 / 1.18)}%`,
                  }}
                />
                {/* Ceiling line */}
                <span
                  aria-hidden
                  className="absolute top-0 z-10 h-full border-l-2 border-semantic-danger"
                  style={{ left: `${100 / 1.18}%` }}
                />
                <span
                  className={
                    "absolute left-0 top-0 h-full transition-all " + barColor
                  }
                  style={{ width: `${widthPct}%` }}
                />
                {isProposed && (
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded-sm bg-paper px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-pressed shadow-sm">
                    proposed
                  </span>
                )}
              </div>
              <div className="w-32 flex-shrink-0 text-right">
                <p className="font-serif text-body font-semi tabular-nums text-ink-1">
                  {pct.toFixed(2)}%
                </p>
                <p className="font-mono text-mono-sm tabular-nums text-ink-3">
                  {fmtFull(b.committed_usd)}
                </p>
              </div>
              <Badge tone={tone as "neutral" | "warning" | "danger"} dot>
                {tone === "danger"
                  ? "breach"
                  : tone === "warning"
                    ? "watch"
                    : "ok"}
              </Badge>
            </div>
          );
        })}
      </div>

      <p className="text-mono-sm text-ink-3">
        12 CFR 32 limits unsecured loans to one borrower at 15% of unimpaired
        capital + surplus. Atrium watches at the {SINGLE_BORROWER_WATCH_PCT}%
        prudential line; the regulator hard-stops at {SINGLE_BORROWER_HARD_LIMIT_PCT}%.
      </p>
    </div>
  );
};
