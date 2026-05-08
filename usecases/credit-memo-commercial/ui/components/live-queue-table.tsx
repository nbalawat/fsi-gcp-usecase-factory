"use client";

/**
 * Live-updating queue table. Initial rows come from the server via
 * `getActiveCases` (Server Component prefetch); subsequent updates arrive over
 * SSE through `useLiveQueue` and replace the state in place. New rows fade in;
 * existing rows update silently.
 *
 * Shape mirrors the table on app/page.tsx — borrower / loan / stage / risk /
 * dscr / recommendation / clock — but each row is the live ApplicationState
 * row not a frozen CaseRecord.
 */

import * as React from "react";
import { Clock, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CaseRow } from "@/app/cases/case-row";
import { useLiveQueue } from "@/lib/live-stream";
import type { ApplicationState } from "../lib/types";

interface Props {
  /** Server-rendered initial rows. Replaced once SSE delivers `snapshot`. */
  initialCases: ApplicationState[];
}

const fmtUsd = (n: number): string => {
  // Hand-rolled compact formatter so server-side Node ICU and browser ICU
  // always agree (avoids Next.js hydration mismatches like "$25.0M" vs "$25M").
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const stageLabel: Record<string, string> = {
  intake: "Application received",
  spreading: "Spreading financials",
  policy: "Policy & limits",
  scoring: "Policy & limits",
  drafting: "Drafting memo",
  underwrite: "Drafting memo",
  approval: "Awaiting your decision",
  decision: "Decision made",
  posting: "Posting to GL",
  done: "Closed",
};

const riskTone = (b: string | null) =>
  !b
    ? ("neutral" as const)
    : b.startsWith("1")
      ? ("success" as const)
      : b.startsWith("2") || b.startsWith("3")
        ? ("warning" as const)
        : ("danger" as const);

const decisionTone = (d: string | null) =>
  d === "APPROVE"
    ? ("success" as const)
    : d === "DECLINE" || d === "STALLED"
      ? ("danger" as const)
      : ("warning" as const);

const decisionLabel = (d: string | null) =>
  !d
    ? "—"
    : d === "RETURN_FOR_REVISION"
      ? "Return"
      : d === "APPROVE"
        ? "Approve"
        : d === "DECLINE"
          ? "Decline"
          : d === "STALLED"
            ? "Blocked"
            : d;

const hoursToDeadline = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, (t - Date.now()) / (1000 * 60 * 60));
};

/** Relative time: "12s ago", "5m ago", "2h ago", "3d ago". */
const fmtRelative = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
};

/** Absolute time, short form: "Jan 12  3:42 PM". */
const fmtAbsolute = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const LiveQueueTable: React.FC<Props> = ({ initialCases }) => {
  const { cases: liveCases, status } = useLiveQueue();
  // Until the SSE delivers its first snapshot we keep showing the server prefetch
  // so the page never flickers empty on hydration.
  const [hasSnapshot, setHasSnapshot] = React.useState(false);
  React.useEffect(() => {
    if (liveCases.length > 0) setHasSnapshot(true);
  }, [liveCases.length]);
  const cases = hasSnapshot ? liveCases : initialCases;

  // Sort: in-flight first (by updated_at desc), then done (by updated_at desc)
  const sorted = React.useMemo(() => {
    return [...cases].sort((a, b) => {
      const aDone = a.current_stage === "done" ? 1 : 0;
      const bDone = b.current_stage === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });
  }, [cases]);

  return (
    <>
      {/* Live indicator caption */}
      <div className="flex items-center justify-between border-b border-rule px-5 py-2 text-mono-sm font-mono text-ink-3">
        <span>{cases.length} cases</span>
        <span className="flex items-center gap-1.5">
          {status === "connected" ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-semantic-success" />
              <span className="text-semantic-success">Live</span>
              <span className="text-ink-4">· auto-updates as cases progress</span>
            </>
          ) : status === "connecting" ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-ink-3 animate-pulse" />
              <span>Connecting…</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-semantic-warning" />
              <span className="text-semantic-warning">Reconnecting…</span>
            </>
          )}
        </span>
      </div>

      <table className="w-full border-collapse text-ui">
        <thead>
          <tr className="border-b border-rule text-eyebrow uppercase tracking-[0.06em] text-ink-3">
            <th className="px-5 py-2.5 text-left font-medium">Borrower</th>
            <th className="px-5 py-2.5 text-left font-medium">Loan</th>
            <th className="px-5 py-2.5 text-left font-medium">Submitted</th>
            <th className="px-5 py-2.5 text-left font-medium">Stage</th>
            <th className="px-5 py-2.5 text-left font-medium">Last activity</th>
            <th className="px-5 py-2.5 text-left font-medium">Risk</th>
            <th className="px-5 py-2.5 text-left font-medium">DSCR</th>
            <th className="px-5 py-2.5 text-left font-medium">Recommendation</th>
            <th className="px-5 py-2.5 text-left font-medium">OCC clock</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={9} className="px-5 py-12 text-center text-body-sm text-ink-3">
                No applications in flight. Drop a 10-K above to start one, or
                run the simulator to seed the queue.
              </td>
            </tr>
          )}
          {sorted.map((c) => {
            const hRemain = hoursToDeadline(c.regulatory_deadline ?? null);
            const clockTone = c.stuck
              ? "danger"
              : hRemain != null && hRemain < 8
                ? "danger"
                : hRemain != null && hRemain < 24
                  ? "warning"
                  : "neutral";
            return (
              <CaseRow
                key={c.application_id}
                href={`/cases/${encodeURIComponent(c.application_id)}`}
              >
                <td className="px-5 py-3">
                  <div className="font-semi text-ink-1">{c.borrower_name}</div>
                  <div className="font-mono text-mono-sm text-ink-3">
                    {c.naics_code ? `NAICS ${c.naics_code}` : c.borrower_id}
                  </div>
                </td>
                <td className="px-5 py-3 font-semi tabular-nums text-ink-1">
                  {fmtUsd(Number(c.loan_amount_usd))}
                </td>
                <td className="px-5 py-3 text-ink-2" title={fmtAbsolute(c.created_at)}>
                  <div className="font-mono text-mono-sm text-ink-2">
                    {fmtRelative(c.created_at)}
                  </div>
                  <div className="font-mono text-mono-sm text-ink-3">
                    {fmtAbsolute(c.created_at)}
                  </div>
                </td>
                <td className="px-5 py-3 text-ink-2">
                  {stageLabel[c.current_stage] ?? c.current_stage}
                </td>
                <td className="px-5 py-3 text-ink-3" title={fmtAbsolute(c.updated_at ?? c.created_at)}>
                  <span className="font-mono text-mono-sm">
                    {fmtRelative(c.updated_at ?? c.created_at)}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {c.risk_band ? (
                    <Badge tone={riskTone(c.risk_band)} dot>
                      {c.risk_band.replace(/^(\d)-(.+)$/, "$1 · $2")}
                    </Badge>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="px-5 py-3 font-mono tabular-nums text-ink-2">
                  {c.dscr_base != null ? `${Number(c.dscr_base).toFixed(2)}x` : "—"}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={decisionTone(c.decision)} dot>
                    {decisionLabel(c.decision)}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  {hRemain == null ? (
                    <span className="text-ink-3">—</span>
                  ) : (
                    <Badge
                      tone={clockTone as "danger" | "warning" | "neutral"}
                    >
                      <Clock className="h-3 w-3" />
                      {hRemain < 1
                        ? "<1h"
                        : hRemain < 24
                          ? `${hRemain.toFixed(0)}h`
                          : `${(hRemain / 24).toFixed(1)}d`}
                    </Badge>
                  )}
                </td>
              </CaseRow>
            );
          })}
        </tbody>
      </table>
    </>
  );
};
