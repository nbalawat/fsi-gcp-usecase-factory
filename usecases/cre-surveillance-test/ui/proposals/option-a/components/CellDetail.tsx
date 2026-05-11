import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import {
  FACILITIES,
  RISK_DIMENSIONS,
  bandLabel,
  shortUsd,
  type BandKey,
  type Facility,
} from "../lib/data";

/**
 * Cell-detail surface for /case/[id]. The facility's 5 risk-dimension
 * cells reproduced as a vertical strip — same color language as the
 * home grid — alongside its identifiers. Peer-row block keeps the
 * executive frame: how this facility compares to the same-NAICS peers
 * already in the grid (single-line per peer, no narrative).
 */
export function CellDetail({ facility }: { facility: Facility }): React.ReactElement {
  const peers = FACILITIES.filter(
    (f) => f.naics === facility.naics && f.id !== facility.id,
  ).slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Dimension cells — re-uses the grid color language. */}
      <section
        aria-label="Risk dimensions for this facility"
        className="rounded-md border border-rule bg-paper lg:col-span-2"
      >
        <header className="border-b border-rule px-3 py-2">
          <div className="eyebrow">Risk dimensions</div>
          <h2 className="text-h4 font-semi text-ink-1">
            {facility.borrowerName} · {facility.id}
          </h2>
        </header>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {RISK_DIMENSIONS.map((d) => (
            <li
              key={d.id}
              className="flex flex-col items-stretch gap-2 border-b border-rule p-3 last:border-b-0 sm:border-b sm:border-r sm:last:border-r-0 lg:border-b-0"
              title={d.tooltip}
            >
              <div className="eyebrow">{d.label}</div>
              <Swatch band={facility.bands[d.id]} />
              <span className="text-mono-sm font-mono text-ink-2">
                {bandLabel(facility.bands[d.id])}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Peer rows — same NAICS, surfaced as a short list. */}
      <section
        aria-label="Same-NAICS peers"
        className="rounded-md border border-rule bg-paper"
      >
        <header className="border-b border-rule px-3 py-2">
          <div className="eyebrow">Peers in grid</div>
          <h2 className="text-h4 font-semi text-ink-1">NAICS {facility.naics}</h2>
        </header>
        {peers.length === 0 ? (
          <p className="px-3 py-3 text-mono-sm text-ink-3">No peers in grid.</p>
        ) : (
          <ul className="flex flex-col">
            {peers.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
              >
                <span className="min-w-0 truncate text-ui text-ink-1">
                  {p.borrowerName}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-mono-sm text-ink-3">
                    {p.geo}
                  </span>
                  <StatusBadge kind={bandToTone(p.bands.dscr)}>
                    {p.bands.dscr.split("-")[0]}
                  </StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        )}
        <footer className="border-t border-rule px-3 py-2 font-mono text-mono-sm text-ink-3">
          exposure {shortUsd(facility.exposureUsd)} · {facility.geo}
        </footer>
      </section>
    </div>
  );
}

const SWATCH_BG: Record<BandKey, string> = {
  "1-pass":             "bg-riskBand-1-pass",
  "2-special-mention":  "bg-riskBand-2-special-mention",
  "3-substandard":      "bg-riskBand-3-substandard",
  "4-doubtful":         "bg-riskBand-4-doubtful",
  "5-loss":             "bg-riskBand-5-loss",
};

function Swatch({ band }: { band: BandKey }): React.ReactElement {
  return (
    <span aria-hidden className={`block h-5 w-full rounded-sm ${SWATCH_BG[band]}`} />
  );
}

function bandToTone(
  b: BandKey,
): "success" | "warning" | "danger" | "neutral" {
  if (b === "1-pass") return "success";
  if (b === "2-special-mention") return "warning";
  if (b === "3-substandard" || b === "4-doubtful" || b === "5-loss") return "danger";
  return "neutral";
}
