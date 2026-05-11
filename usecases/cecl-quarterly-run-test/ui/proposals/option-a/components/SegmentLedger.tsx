import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import {
  type LedgerRow,
  type RailStageId,
  fmtBps,
  fmtPct,
  fmtUsdM,
} from "../lib/data";

interface Props {
  stageId: RailStageId;
  ledger: readonly LedgerRow[];
}

/**
 * Dense numeric ledger — the "every pixel earns its place" surface.
 *
 * Renders one row per segment, with PD / LGD / EAD / ECL_bps / ECL_$M
 * across columns and, for the projection stage, four forward quarter
 * columns derived from the segment's base PD bps via a deterministic
 * curve (pure presentation — no business decision happens here).
 *
 * Server component — display-only. No animations, no client interactivity.
 */
export const SegmentLedger: React.FC<Props> = ({ stageId, ledger }) => {
  if (stageId === "segment_classification") {
    return <SegmentClassificationTable ledger={ledger} />;
  }
  if (stageId === "pd_lgd_projection") {
    return <ProjectionTable ledger={ledger} />;
  }
  if (stageId === "exception_review") {
    return <ExceptionTable ledger={ledger.filter((r) => r.exception)} />;
  }
  return <AttestationLedger ledger={ledger} />;
};

const RISK_BAND_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  "1-pass": "success",
  "2-special-mention": "warning",
  "3-substandard": "danger",
  "4-doubtful": "danger",
  "5-loss": "danger",
};

// ─── stage 1: segment classification ──────────────────────────────────
const SegmentClassificationTable: React.FC<{ ledger: readonly LedgerRow[] }> = ({
  ledger,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse text-mono-sm">
      <caption className="sr-only">
        Segment classification — twelve segments resolved by NAICS, geo, and revenue band.
      </caption>
      <thead className="bg-paper-2">
        <tr className="border-b border-rule">
          <Th className="text-left">Segment</Th>
          <Th>NAICS</Th>
          <Th>Geo</Th>
          <Th className="text-right">EAD&nbsp;($M)</Th>
          <Th>Band</Th>
        </tr>
      </thead>
      <tbody>
        {ledger.map((r) => (
          <tr key={r.segmentId} className="border-b border-rule">
            <Td className="text-left">
              <div className="text-ink-1 font-sans">{r.segmentName}</div>
              <div className="text-ink-3 font-mono text-mono-sm">{r.segmentId}</div>
            </Td>
            <Td>{r.naics}</Td>
            <Td>{r.geo}</Td>
            <Td className="text-right tabular-nums">{r.ead_usd_m.toLocaleString()}</Td>
            <Td>
              <StatusBadge kind={RISK_BAND_TONE[r.riskBand] ?? "neutral"}>
                {r.riskBand}
              </StatusBadge>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── stage 2: PD / LGD projection (segments × 4 forecast quarters × bps) ─
const ProjectionTable: React.FC<{ ledger: readonly LedgerRow[] }> = ({ ledger }) => {
  // Forecast curve: linear ramp +5%/quarter over base PD. Pure transform.
  const quarters = ["Q3 2026", "Q4 2026", "Q1 2027", "Q2 2027"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-mono-sm">
        <caption className="sr-only">
          PD / LGD projection — twelve segments by eight forecast metrics.
        </caption>
        <thead className="bg-paper-2">
          <tr className="border-b border-rule">
            <Th className="text-left">Segment</Th>
            <Th className="text-right">LGD</Th>
            <Th className="text-right">EAD&nbsp;($M)</Th>
            {quarters.map((q) => (
              <Th key={q} className="text-right">
                <span className="block text-ink-3 text-[10px] uppercase">{q}</span>
                <span className="block">PD&nbsp;(bps)</span>
              </Th>
            ))}
            <Th className="text-right">ECL&nbsp;(bps)</Th>
            <Th className="text-right">ECL&nbsp;($M)</Th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((r) => (
            <tr key={r.segmentId} className="border-b border-rule">
              <Td className="text-left">
                <div className="text-ink-1 font-sans">{r.segmentName}</div>
                <div className="text-ink-3 font-mono text-mono-sm">{r.segmentId}</div>
              </Td>
              <Td className="text-right tabular-nums">{fmtPct(r.lgd_pct)}</Td>
              <Td className="text-right tabular-nums">{r.ead_usd_m.toLocaleString()}</Td>
              {quarters.map((q, i) => {
                const pd = Math.round(r.pd_bps * (1 + i * 0.05));
                return (
                  <Td key={q} className="text-right tabular-nums">
                    {pd}
                  </Td>
                );
              })}
              <Td className="text-right tabular-nums font-medium">{r.ecl_bps}</Td>
              <Td className="text-right tabular-nums font-medium text-ink-1">
                {r.ecl_usd_m.toFixed(2)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── stage 3: exception review ─────────────────────────────────────────
const ExceptionTable: React.FC<{ ledger: readonly LedgerRow[] }> = ({ ledger }) => {
  if (ledger.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-ink-3">
        No exceptions this quarter.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-mono-sm">
        <caption className="sr-only">
          Exception review — segments flagged for human review.
        </caption>
        <thead className="bg-paper-2">
          <tr className="border-b border-rule">
            <Th className="text-left">Segment</Th>
            <Th>Band</Th>
            <Th className="text-right">EAD&nbsp;($M)</Th>
            <Th className="text-right">ECL&nbsp;(bps)</Th>
            <Th className="text-left">Reason</Th>
            <Th className="text-left">Recommended disposition</Th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((r) => (
            <tr key={r.segmentId} className="border-b border-rule">
              <Td className="text-left">
                <div className="text-ink-1 font-sans">{r.segmentName}</div>
                <div className="text-ink-3 font-mono text-mono-sm">{r.segmentId}</div>
              </Td>
              <Td>
                <StatusBadge kind={RISK_BAND_TONE[r.riskBand] ?? "neutral"}>
                  {r.riskBand}
                </StatusBadge>
              </Td>
              <Td className="text-right tabular-nums">{r.ead_usd_m.toLocaleString()}</Td>
              <Td className="text-right tabular-nums">{r.ecl_bps}</Td>
              <Td className="text-left text-ink-2">{r.exceptionReason}</Td>
              <Td className="text-left">
                <StatusBadge kind="warning">qual-overlay +15 bps</StatusBadge>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── stage 4: attestation totals ───────────────────────────────────────
const AttestationLedger: React.FC<{ ledger: readonly LedgerRow[] }> = ({ ledger }) => {
  const total_ead = ledger.reduce((s, r) => s + r.ead_usd_m, 0);
  const total_ecl = ledger.reduce((s, r) => s + r.ecl_usd_m, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-mono-sm">
        <caption className="sr-only">
          Attestation totals — final allowance summed across segments.
        </caption>
        <thead className="bg-paper-2">
          <tr className="border-b border-rule">
            <Th className="text-left">Segment</Th>
            <Th>Band</Th>
            <Th className="text-right">EAD&nbsp;($M)</Th>
            <Th className="text-right">ECL&nbsp;(bps)</Th>
            <Th className="text-right">ECL&nbsp;($M)</Th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((r) => (
            <tr key={r.segmentId} className="border-b border-rule">
              <Td className="text-left">
                <div className="text-ink-1 font-sans">{r.segmentName}</div>
                <div className="text-ink-3 font-mono text-mono-sm">{r.segmentId}</div>
              </Td>
              <Td>
                <StatusBadge kind={RISK_BAND_TONE[r.riskBand] ?? "neutral"}>
                  {r.riskBand}
                </StatusBadge>
              </Td>
              <Td className="text-right tabular-nums">{r.ead_usd_m.toLocaleString()}</Td>
              <Td className="text-right tabular-nums">{r.ecl_bps}</Td>
              <Td className="text-right tabular-nums font-medium text-ink-1">
                {r.ecl_usd_m.toFixed(2)}
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-paper-2">
          <tr className="border-t border-border-strong">
            <Td className="text-left font-semi text-ink-1">Total allowance</Td>
            <Td />
            <Td className="text-right tabular-nums font-semi text-ink-1">
              {total_ead.toLocaleString()}
            </Td>
            <Td />
            <Td className="text-right tabular-nums font-semi text-ink-1">
              {fmtUsdM(Math.round(total_ecl * 10) / 10)}
            </Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ─── primitives ────────────────────────────────────────────────────────
const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <th
    scope="col"
    className={`px-3 py-2 text-center text-ink-3 font-medium font-mono text-[11px] uppercase tracking-wide ${className ?? ""}`}
  >
    {children}
  </th>
);

const Td: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <td className={`px-3 py-2 text-center text-ink-1 ${className ?? ""}`}>
    {children}
  </td>
);
