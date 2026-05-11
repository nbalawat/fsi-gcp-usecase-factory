import * as React from "react";
import type { Borrower } from "../lib/data";

export interface BorrowerFactSheetProps {
  borrower: Borrower;
  caseId: string;
  title: string;
}

/**
 * Five-pair fact sheet rendered at the top of the borrower section.
 * Pure presentation — receives values from the case record verbatim.
 * No ratios computed, no thresholds checked.
 *
 * Uses CSS grid for a label/value pair pattern that the standards
 * already approve.
 */
export const BorrowerFactSheet: React.FC<BorrowerFactSheetProps> = ({
  borrower,
  caseId,
  title,
}) => {
  const fmtUsd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const pairs: { label: string; value: string }[] = [
    { label: "Case", value: caseId },
    { label: "Facility", value: title },
    { label: "Borrower", value: borrower.name },
    { label: "Domicile", value: borrower.geo },
    { label: "NAICS", value: borrower.naics },
    { label: "Revenue", value: fmtUsd.format(borrower.revenue_usd) },
    { label: "Risk band", value: borrower.risk_band },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-4">
      {pairs.map((p) => (
        <div key={p.label} className="flex flex-col">
          <dt className="eyebrow">{p.label}</dt>
          <dd className="text-sm text-ink-1">{p.value}</dd>
        </div>
      ))}
    </dl>
  );
};
