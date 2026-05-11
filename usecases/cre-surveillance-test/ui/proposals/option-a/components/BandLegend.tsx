import * as React from "react";
import { bandLabel, tallyByBand, type BandKey } from "../lib/data";

/**
 * The tiny right rail. One row per OCC risk band: color swatch, label,
 * count of cells currently in that band across the whole grid.
 * Sparse, scan-friendly, terminal-feeling. No interactivity.
 */
export function BandLegend(): React.ReactElement {
  const rows = tallyByBand();
  return (
    <section
      aria-label="Risk-band legend"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="border-b border-rule px-3 py-2">
        <div className="eyebrow">OCC band</div>
        <h2 className="text-h4 font-semi text-ink-1">Cells by band</h2>
      </header>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li
            key={r.band}
            className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
          >
            <span className="flex items-center gap-2">
              <Swatch band={r.band} />
              <span className="text-ui text-ink-1">{bandLabel(r.band)}</span>
            </span>
            <span className="font-mono text-mono-sm text-ink-2 tabular-nums">
              {r.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SWATCH: Record<BandKey, string> = {
  "1-pass":             "bg-riskBand-1-pass",
  "2-special-mention":  "bg-riskBand-2-special-mention",
  "3-substandard":      "bg-riskBand-3-substandard",
  "4-doubtful":         "bg-riskBand-4-doubtful",
  "5-loss":             "bg-riskBand-5-loss",
};

function Swatch({ band }: { band: BandKey }): React.ReactElement {
  return (
    <span
      aria-hidden
      className={`inline-block h-3 w-6 rounded-sm ${SWATCH[band]}`}
    />
  );
}
