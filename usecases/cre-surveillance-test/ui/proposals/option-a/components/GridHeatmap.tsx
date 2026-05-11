import * as React from "react";
import Link from "next/link";
import {
  FACILITIES,
  RISK_DIMENSIONS,
  bandLabel,
  shortUsd,
  type BandKey,
  type Facility,
  type RiskDimensionId,
} from "../lib/data";

/**
 * The 2D facility × risk-dimension heatmap. This component IS the home
 * page — chrome shrinks to a top strip + tiny right rail. Every cell is
 * color-banded by OCC risk band; hover surfaces a one-line tooltip;
 * click drills into /case/<facility>.
 *
 * Server component. No interactivity beyond the native `<a>` link and
 * the CSS `:hover` tooltip — no `useState`, no `onClick`, no `useEffect`.
 * That keeps the page Static Generated, sub-30-second to scan, and zero
 * client JS for the executive read.
 *
 * Width budget: full grid column (≥720px). At narrower widths the table
 * stays readable via horizontal scroll inside the wrapper.
 */
export function GridHeatmap(): React.ReactElement {
  return (
    <section
      aria-label="Facility × risk-dimension grid"
      className="overflow-x-auto"
    >
      <table className="w-full border-collapse text-mono-sm">
        <thead>
          <tr className="border-b border-rule">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-paper px-3 py-2 text-left font-mono text-eyebrow uppercase tracking-wider text-ink-3"
            >
              Facility · borrower · geo · exposure
            </th>
            {RISK_DIMENSIONS.map((d) => (
              <th
                key={d.id}
                scope="col"
                title={d.tooltip}
                className="px-2 py-2 text-center font-mono text-eyebrow uppercase tracking-wider text-ink-3"
              >
                {d.label}
              </th>
            ))}
            <th
              scope="col"
              className="px-3 py-2 text-right font-mono text-eyebrow uppercase tracking-wider text-ink-3"
            >
              Drill
            </th>
          </tr>
        </thead>
        <tbody>
          {FACILITIES.map((f) => (
            <FacilityRow key={f.id} facility={f} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FacilityRow({ facility }: { facility: Facility }): React.ReactElement {
  return (
    <tr className="border-b border-rule hover:bg-paper-2">
      <th
        scope="row"
        className="sticky left-0 z-10 max-w-xs truncate bg-paper px-3 py-2 text-left text-ui font-medium text-ink-1 group-hover:bg-paper-2"
      >
        <Link
          href={`/case/${facility.id}`}
          className="block text-ink-1 hover:text-accent-pressed"
          title={`Drill into ${facility.borrowerName}`}
        >
          <span className="block truncate font-mono text-mono-sm text-ink-2">
            {facility.id}
          </span>
          <span className="block truncate font-sans text-ui text-ink-1">
            {facility.borrowerName}
          </span>
          <span className="block truncate font-mono text-mono-sm text-ink-3">
            {facility.geo} · NAICS {facility.naics} · {shortUsd(facility.exposureUsd)}
          </span>
        </Link>
      </th>
      {RISK_DIMENSIONS.map((d) => (
        <td key={d.id} className="px-1 py-1 align-middle">
          <Cell
            band={facility.bands[d.id]}
            dimension={d.id}
            facility={facility}
          />
        </td>
      ))}
      <td className="px-3 py-2 text-right">
        <Link
          href={`/case/${facility.id}`}
          className="font-mono text-mono-sm text-accent-pressed hover:underline"
        >
          →
        </Link>
      </td>
    </tr>
  );
}

const BAND_BG: Record<BandKey, string> = {
  "1-pass":             "bg-riskBand-1-pass",
  "2-special-mention":  "bg-riskBand-2-special-mention",
  "3-substandard":      "bg-riskBand-3-substandard",
  "4-doubtful":         "bg-riskBand-4-doubtful",
  "5-loss":             "bg-riskBand-5-loss",
};

function Cell({
  band,
  dimension,
  facility,
}: {
  band: BandKey;
  dimension: RiskDimensionId;
  facility: Facility;
}): React.ReactElement {
  const tooltip = `${facility.borrowerName} · ${dimension} · ${bandLabel(band)}`;
  return (
    <Link
      href={`/case/${facility.id}`}
      title={tooltip}
      aria-label={tooltip}
      className={`block h-7 w-full rounded-sm ${BAND_BG[band]} ring-0 ring-paper hover:ring-2 hover:ring-accent`}
    />
  );
}
