/**
 * Pure formatters for the agent audit-trail UI. Translate internal IDs
 * (agent roles, event types, service slugs) into banker-facing copy.
 *
 * Adding a new label here is the right way to teach the audit trail about
 * a new agent role. Don't do per-component string-mapping.
 */

import type { AuditEvent } from "./types";

/** Map an internal agent role to a banker-friendly job title. */
export function roleLabel(role: string | undefined | null): string {
  if (!role) return "Specialist";
  const map: Record<string, string> = {
    document_classifier: "Document classifier",
    extractor: "Document extractor",
    spreader: "Financial spreader",
    rater: "Risk rater",
    drafter: "Memo drafter",
    reviewer: "Memo reviewer",
    citation_checker: "Citation checker",
    customer_concentration_analyzer: "Customer concentration analyst",
    industry_risk_analyzer: "Industry risk analyst",
    covenant_analyzer: "Covenant analyst",
    peer_benchmarker: "Peer benchmarker",
    exposure_analyzer: "Exposure analyst",
    insider_screener: "Insider screener",
  };
  if (map[role]) return map[role];
  // Fallback — humanize "snake_case" → "Snake case".
  return role
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Map an internal service slug to a banker-friendly verb phrase. */
export function serviceLabel(name: string | undefined | null): string {
  if (!name) return "Service";
  const map: Record<string, string> = {
    "svc-financial-spreader": "Spreading financials",
    "svc-dscr-calculator": "Computing DSCR",
    "svc-covenant-analyzer": "Analyzing covenants",
    "svc-peer-benchmarker": "Benchmarking against peers",
    "svc-industry-risk-scorer": "Scoring industry risk",
    "svc-collateral-valuator": "Valuing collateral",
    "svc-exposure-aggregator": "Aggregating exposure",
    "svc-insider-screening": "Screening insider exposure",
    "svc-citation-formatter": "Formatting citations",
  };
  if (map[name]) return map[name];
  return name.replace(/^svc-/, "").replace(/[-_]+/g, " ");
}

/** Map an internal rule id to a short banker-friendly description. */
export function ruleLabel(name: string | undefined | null): string {
  if (!name) return "Rule";
  const map: Record<string, string> = {
    "rule-document-completeness": "Document completeness",
    "rule-single-borrower-limit": "OCC single-borrower limit",
    "rule-covenant-floor": "Covenant floor (DSCR)",
    "rule-leverage-ceiling": "Leverage ceiling",
    "rule-relationship-tenure": "Relationship tenure",
  };
  if (map[name]) return map[name];
  return name.replace(/^rule-/, "").replace(/[-_]+/g, " ");
}

export type DerivedStatus = "running" | "done" | "skipped" | "error";

/** Best-effort derivation of run-state for a row's status dot. */
export function eventStatus(e: AuditEvent): DerivedStatus {
  if (e.event_type === "rule_skipped") return "skipped";
  const result = (e.payload as Record<string, unknown>)?.result;
  if (typeof result === "string") {
    if (result === "fail" || result === "error") return "error";
    if (result === "skipped") return "skipped";
  }
  if (e.event_type === "agent_action") {
    const completed_at = (e.payload as Record<string, unknown>)?.completed_at;
    if (!completed_at) return "running";
  }
  return "done";
}

/** Banker-readable verb for any event row. */
export function eventTitle(e: AuditEvent): string {
  switch (e.event_type) {
    case "stage_entered": {
      const stage = (e.payload as Record<string, unknown>)?.stage;
      return `Entered stage: ${typeof stage === "string" ? stage : "unknown"}`;
    }
    case "service_invoked":
      return serviceLabel(e.service_name);
    case "rule_evaluated":
    case "rule_skipped": {
      const rule = (e.payload as Record<string, unknown>)?.rule;
      return ruleLabel(typeof rule === "string" ? rule : e.service_name);
    }
    case "agent_action": {
      const role = (e.payload as Record<string, unknown>)?.agent_role;
      return roleLabel(typeof role === "string" ? role : null);
    }
    case "decision_made": {
      const decision = (e.payload as Record<string, unknown>)?.decision;
      return `Decision recorded: ${typeof decision === "string" ? decision : "—"}`;
    }
    case "sink_completed":
      return `Wrote to ${e.service_name ?? "downstream system"}`;
    default:
      return e.event_type;
  }
}

export function fmtLatency(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function fmtCost(usd: number | undefined | null, full = false): string {
  if (usd === undefined || usd === null) return "—";
  if (usd === 0) return "$0";
  if (full || usd >= 1) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 4,
    }).format(usd);
  }
  // Three significant cents-and-below digits look right for sub-dollar amounts.
  return `$${usd.toFixed(usd < 0.01 ? 4 : 3)}`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
