/**
 * Translate a CaseRecord into a credit-officer-friendly timeline.
 *
 * Every label, subtitle, and "by" line is plain English — no platform jargon.
 * Internal terms (atomic services / rules / agent / sinks / pubsub topics)
 * never appear in user-facing UI.
 */

import type { TimelineStep } from "../components/workflow-timeline";
import type { CaseRecord } from "./types";

const STAGE_INDEX: Record<string, number> = {
  intake: 0,
  spreading: 1,
  scoring: 2,
  underwrite: 3,
  approval: 4,
  decision: 5,
  posting: 6,
  done: 6,
};

const fmtTime = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return undefined;
  return t.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const fmtAgo = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return undefined;
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
};

export function buildTimeline(c: CaseRecord): TimelineStep[] {
  const stage = STAGE_INDEX[c.stage] ?? 0;
  const stalled = !!c.stuck;

  const stepState = (i: number): TimelineStep["state"] => {
    if (i < stage) return "done";
    if (i === stage) return stalled ? "blocked" : "active";
    return "pending";
  };

  const submittedAt = c.clock_started_at;
  const dscr = c.dscr_base;
  const ratio = c.single_borrower_pct;

  return [
    {
      icon: "received",
      title: "Application received",
      subtitle: `Loan request from ${c.borrower_name} — ${fmtUsd(c.loan_amount_usd)} ${c.naics_code ? `· NAICS ${c.naics_code}` : ""}`,
      when: fmtTime(submittedAt),
      by: "Relationship manager portal",
      state: stepState(0) === "pending" ? "done" : stepState(0),
    },
    {
      icon: "spreading",
      title: "Financials spread & ratios computed",
      subtitle:
        dscr !== undefined
          ? `Pulled the latest 10-K + interim statements. Computed DSCR ${dscr.toFixed(2)}x${c.dscr_stressed !== undefined ? ` (stressed ${c.dscr_stressed.toFixed(2)}x)` : ""}, leverage, current ratio, peer comparison.`
          : stalled && stage === 1
            ? "Document parsing timed out — the borrower's uploaded statements couldn't be read."
            : "Pulling 10-K + interim statements; computing DSCR, leverage, peer comparison.",
      by: "System · automated underwriting",
      state: stepState(1),
    },
    {
      icon: "policy",
      title: "Policy & limits checked",
      subtitle: ratio !== undefined
        ? `Single-borrower exposure ${(ratio).toFixed(2)}% of Tier 1 · regulatory thresholds, eligibility, and approval-matrix rules evaluated.`
        : "Checking single-borrower limit (12 CFR 32), insider-lending screen, and approval-matrix.",
      by: "Bank policy · regulatory rules",
      state: stepState(2),
    },
    {
      icon: "drafting",
      title: "Memo drafted",
      subtitle: c.rationale_summary
        ? c.rationale_summary
        : stage >= 3
          ? "Memo prepared with full citations to financials, policies, and peer benchmarks."
          : "Will be drafted once policy check completes.",
      by: c.citation_density !== undefined
        ? `AI underwriter · ${(c.citation_density * 100).toFixed(0)}% of claims cite a source`
        : "AI underwriter",
      state: stepState(3),
    },
    {
      icon: "decision",
      title: "Awaiting credit officer decision",
      subtitle: c.decision === "STALLED"
        ? "Cannot proceed — see blockers above."
        : c.decision === "APPROVE"
          ? `Recommendation: APPROVE${c.approval_authority ? ` · ${formatAuthority(c.approval_authority)}` : ""}`
          : c.decision === "DECLINE"
            ? `Recommendation: DECLINE — ${c.decline_reasons?.[0] ?? "see memo"}`
            : `Recommendation: RETURN FOR REVISION — ${c.return_reasons?.[0] ?? "see memo"}`,
      by: c.approval_authority ? formatAuthority(c.approval_authority) : "Credit officer",
      state: stepState(4),
    },
    {
      icon: "posted",
      title: "Posted to systems of record",
      subtitle: stage >= 5
        ? "GL entry recorded · memo archived to document store · borrower notified."
        : "After approval, GL posting fires and the memo is archived.",
      by: "System · automated posting",
      state: stepState(5),
    },
  ];
}

function fmtUsd(n: number): string {
  // Hand-rolled to keep server (Node ICU) and client (browser ICU) output
  // byte-identical; Intl.NumberFormat compact disagrees on trailing zeros
  // across runtimes and triggers React hydration mismatches.
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatAuthority(a: string): string {
  return a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export { fmtAgo };
