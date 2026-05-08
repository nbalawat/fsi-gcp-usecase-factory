"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  SECTOR_CELL_WATCH_PCT,
  SECTOR_CELL_BREACH_PCT,
} from "@/lib/bank-config";
import type {
  ConcentrationView,
  HeatmapCell,
} from "../../lib/portfolio-data";

interface Props {
  view: ConcentrationView;
  /**
   * If true, renders the larger detail layout used on /concentration. The
   * default is the compact /portfolio variant.
   */
  variant?: "compact" | "detail";
}

const fmtCompact = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const fmtFull = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "standard",
    maximumFractionDigits: 0,
  }).format(n);

/** Color-code a cell from green → ink → amber → red on % of Tier 1. */
function cellTone(pct: number): {
  bg: string;
  text: string;
  label: "safe" | "neutral" | "watch" | "breach" | "empty";
} {
  if (pct === 0) {
    return { bg: "bg-paper-2", text: "text-ink-3", label: "empty" };
  }
  if (pct < 3) {
    return {
      bg: "bg-semantic-successTint/60",
      text: "text-semantic-success",
      label: "safe",
    };
  }
  if (pct < SECTOR_CELL_WATCH_PCT) {
    return { bg: "bg-paper-3", text: "text-ink-2", label: "neutral" };
  }
  if (pct < SECTOR_CELL_BREACH_PCT) {
    return {
      bg: "bg-semantic-warningTint",
      text: "text-semantic-warning",
      label: "watch",
    };
  }
  return {
    bg: "bg-semantic-dangerTint",
    text: "text-semantic-danger",
    label: "breach",
  };
}

export const ConcentrationHeatmap: React.FC<Props> = ({
  view,
  variant = "compact",
}) => {
  const [selected, setSelected] = React.useState<HeatmapCell | null>(null);
  const [hover, setHover] = React.useState<HeatmapCell | null>(null);

  if (view.sectors.length === 0 || view.regions.length === 0) {
    return (
      <div className="rounded-md border border-rule bg-paper-2 px-5 py-12 text-center">
        <p className="text-body-sm font-semi text-ink-1">No exposure to map yet</p>
        <p className="mt-1 text-body-sm text-ink-3">
          Once facilities are booked across sectors and regions, the heatmap
          will surface concentration risk in real time.
        </p>
      </div>
    );
  }

  const cellLookup = new Map<string, HeatmapCell>();
  for (const c of view.cells) cellLookup.set(`${c.sector}|${c.region}`, c);

  const cellSize = variant === "detail" ? 110 : 78;
  const labelWidth = variant === "detail" ? 110 : 90;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="overflow-x-auto"
        role="region"
        aria-label="Sector by region concentration heatmap"
      >
        <div className="inline-flex flex-col gap-1.5">
          {/* Header row: sector labels */}
          <div className="flex items-end gap-1.5">
            <div style={{ width: labelWidth }} aria-hidden />
            {view.sectors.map((s) => (
              <div
                key={s}
                style={{ width: cellSize }}
                className="px-1 pb-1 text-center text-eyebrow uppercase tracking-[0.04em] text-ink-3"
              >
                {s}
              </div>
            ))}
          </div>

          {/* Body rows: region label + cells */}
          {view.regions.map((region) => (
            <div key={region} className="flex items-stretch gap-1.5">
              <div
                style={{ width: labelWidth }}
                className="flex items-center justify-end pr-2 text-mono-sm font-mono text-ink-2"
              >
                {region}
              </div>
              {view.sectors.map((sector) => {
                const cell =
                  cellLookup.get(`${sector}|${region}`) ?? {
                    sector,
                    region,
                    committed: 0,
                    pctTier1: 0,
                    borrowers: [],
                  };
                const tone = cellTone(cell.pctTier1);
                const isSelected =
                  selected?.sector === sector && selected?.region === region;
                return (
                  <button
                    type="button"
                    key={`${sector}|${region}`}
                    onClick={() => setSelected(isSelected ? null : cell)}
                    onMouseEnter={() => setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(cell)}
                    onBlur={() => setHover(null)}
                    aria-label={`${sector} in ${region}: ${fmtFull(cell.committed)} committed, ${cell.pctTier1.toFixed(2)} percent of Tier 1`}
                    className={
                      "flex flex-col items-center justify-center rounded-sm border text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
                      tone.bg +
                      " " +
                      (isSelected
                        ? "border-accent shadow-pop"
                        : "border-rule hover:border-border-strong")
                    }
                    style={{ width: cellSize, height: cellSize }}
                  >
                    <span
                      className={
                        "font-serif font-semi tabular-nums " +
                        tone.text +
                        " " +
                        (variant === "detail" ? "text-h3" : "text-body")
                      }
                    >
                      {cell.pctTier1 > 0 ? cell.pctTier1.toFixed(1) : "—"}
                      {cell.pctTier1 > 0 && (
                        <span className="ml-0.5 text-[0.55em] tracking-tight">%</span>
                      )}
                    </span>
                    <span className="mt-0.5 font-mono text-[10px] text-ink-3">
                      {cell.committed > 0 ? fmtCompact(cell.committed) : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <Legend />

      {/* Hover tooltip details (shown inline below the grid for accessibility) */}
      {hover && hover.borrowers.length > 0 && !selected && (
        <div className="rounded-md border border-rule bg-paper-2 px-4 py-3 text-body-sm text-ink-2">
          <span className="font-semi text-ink-1">{hover.sector}</span> ·{" "}
          {hover.region} — {fmtFull(hover.committed)} ({hover.pctTier1.toFixed(2)}% of Tier 1) ·{" "}
          {hover.borrowers.length} borrower{hover.borrowers.length === 1 ? "" : "s"}
        </div>
      )}

      {/* Selected cell drilldown */}
      {selected && (
        <div className="rounded-md border border-rule bg-paper p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
                {selected.sector} · {selected.region}
              </p>
              <p className="mt-1 font-serif text-h3 font-semi tracking-tight text-ink-1">
                {fmtFull(selected.committed)}{" "}
                <span className="ml-2 font-mono text-mono-sm font-normal text-ink-3">
                  {selected.pctTier1.toFixed(2)}% of Tier 1
                </span>
              </p>
            </div>
            <Badge tone={cellTone(selected.pctTier1).label === "breach" ? "danger" : cellTone(selected.pctTier1).label === "watch" ? "warning" : "neutral"} dot>
              {cellTone(selected.pctTier1).label}
            </Badge>
          </div>
          {selected.borrowers.length > 0 ? (
            <ul className="mt-3 flex flex-col divide-y divide-rule">
              {selected.borrowers.map((b) => (
                <li
                  key={b.borrower_id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm font-semi text-ink-1">
                      {b.legal_name}
                    </p>
                    <p className="font-mono text-mono-sm text-ink-3">
                      {b.naics_code ? `NAICS ${b.naics_code}` : "—"} ·{" "}
                      {b.primary_state ?? "?"} · {b.facility_count} facility
                      {b.facility_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="font-serif text-body font-semi tabular-nums text-ink-1">
                    {fmtFull(b.committed_usd)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-body-sm text-ink-3">
              No active facilities in this cell.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const Legend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-3 text-mono-sm text-ink-3">
    <span>% of Tier 1 capital</span>
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-sm bg-semantic-successTint/60" />
      &lt; 3% safe
    </span>
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-sm bg-paper-3" />
      3–7% routine
    </span>
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-sm bg-semantic-warningTint" />
      7–10% watch
    </span>
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-sm bg-semantic-dangerTint" />
      10%+ breach
    </span>
  </div>
);
