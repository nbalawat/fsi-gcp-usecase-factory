"use client";

/**
 * PipelineActivity — single banker-readable view of every step the
 * pipeline took for one application. Groups events by lifecycle stage
 * (intake → spreading → policy → drafting → decision → posting) and
 * shows for each: who ran (service / rule / agent), at what time, in
 * how long, what it received, what it produced.
 *
 * Click a row to expand the raw JSON request + response.
 *
 * Replaces the cryptic chronological event list. Built for the
 * underwriter's question "what happened to my application?".
 */

import * as React from "react";
import { ChevronDown, ChevronRight, Clock, Database, Bot, Scale, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import type { AuditEvent } from "../lib/types";

interface Props {
  events: AuditEvent[];
}

// ── Stage metadata + grouping ──────────────────────────────────────────

interface StageMeta {
  id: string;
  label: string;
  description: string;
}

const STAGES: StageMeta[] = [
  { id: "intake", label: "Application received", description: "Validated and queued for analysis" },
  { id: "spreading", label: "Spreading & analysis", description: "8 atomic services compute the financials" },
  { id: "policy", label: "Policy & limits", description: "16 regulatory and policy rules evaluated" },
  { id: "drafting", label: "AI underwriting & drafting", description: "13 specialist agents author the memo" },
  { id: "approval", label: "Decision recorded", description: "Recommendation written and published" },
  { id: "posting", label: "Posted to systems of record", description: "GL entry and document store updated" },
];

// Map each event to the stage it belongs to.
function stageFor(e: AuditEvent): string {
  if (e.event_type === "stage_entered") {
    const s = (e.payload as { stage?: string })?.stage;
    return s ?? "intake";
  }
  if (e.event_type === "service_invoked") return "spreading";
  if (e.event_type === "rule_evaluated" || e.event_type === "rule_skipped") return "policy";
  if (e.event_type === "agent_action") return "drafting";
  if (e.event_type === "decision_made") return "approval";
  if (e.event_type === "sink_completed") return "posting";
  return "intake";
}

// ── Banker-friendly labels for service/agent/rule names ──────────────

const SERVICE_LABELS: Record<string, string> = {
  "financial-spreader": "Spread financials",
  "dscr-calculator": "Compute DSCR",
  "covenant-analyzer": "Test covenants",
  "peer-benchmarker": "Compare to peers",
  "industry-risk-scorer": "Score industry risk",
  "collateral-valuator": "Value collateral",
  "exposure-aggregator": "Aggregate exposure",
  "insider-screening": "Screen for insider",
};

const AGENT_LABELS: Record<string, string> = {
  document_classifier: "Classify documents",
  document_extractor: "Extract financial fields",
  financial_spreader_agent: "Narrate the spreading",
  management_quality_rater: "Assess management",
  customer_concentration_analyzer: "Analyze customer concentration",
  peer_set_curator: "Curate peer set",
  stress_scenario_modeler: "Model stress scenarios",
  collateral_appraiser: "Appraise collateral",
  covenant_designer: "Design covenants",
  regulatory_checker: "Run regulatory checks",
  risk_rater: "Assign risk rating",
  rater: "Assign risk rating",
  drafter: "Draft the memo",
  memo_drafter: "Draft the memo",
  memo_reviewer: "Review the memo",
  supervisor: "Coordinate the agent team",
};

function ruleLabel(ruleSet: string | null | undefined): string {
  if (!ruleSet) return "Rule";
  return String(ruleSet)
    .replace(/\/v[0-9-]+(\.[0-9]+)?$/, "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function eventTitle(e: AuditEvent): string {
  const svc = e.service_name ?? "";
  switch (e.event_type) {
    case "service_invoked":
      return SERVICE_LABELS[svc] ?? svc;
    case "rule_evaluated":
    case "rule_skipped": {
      const rs = (e.payload as { rule_set?: string })?.rule_set;
      return ruleLabel(rs);
    }
    case "agent_action":
      return AGENT_LABELS[svc] ?? svc.replace(/[_-]/g, " ");
    case "stage_entered": {
      const s = (e.payload as { stage?: string })?.stage ?? "stage";
      return `Stage entered: ${s}`;
    }
    case "decision_made":
      return "Decision recorded";
    case "sink_completed":
      return svc;
    default:
      return e.event_type;
  }
}

function eventIcon(e: AuditEvent) {
  switch (e.event_type) {
    case "service_invoked":     return <Database className="h-3.5 w-3.5" />;
    case "rule_evaluated":      return <Scale className="h-3.5 w-3.5" />;
    case "rule_skipped":        return <Scale className="h-3.5 w-3.5 opacity-50" />;
    case "agent_action":        return <Bot className="h-3.5 w-3.5" />;
    case "decision_made":       return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "sink_completed":      return <FileText className="h-3.5 w-3.5" />;
    default:                    return <Clock className="h-3.5 w-3.5" />;
  }
}

// ── Input/output summarization ──────────────────────────────────────

function summarize(obj: unknown, max = 4): Array<{ k: string; v: string }> {
  if (!obj || typeof obj !== "object") return [];
  const out: Array<{ k: string; v: string }> = [];
  const skip = new Set([
    "context_id", "borrower_id", "application_id", "_debug",
    "memo_review_report", "service_results", "synthesized",
    "raw_text", "parse_error",
  ]);
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (skip.has(k)) continue;
    if (out.length >= max) break;
    let display: string;
    if (v == null) continue;
    if (typeof v === "string") display = v.length > 80 ? v.slice(0, 77) + "…" : v;
    else if (typeof v === "number") display = Number.isInteger(v) ? String(v) : v.toFixed(2);
    else if (typeof v === "boolean") display = v ? "yes" : "no";
    else if (Array.isArray(v)) display = `${v.length} item${v.length === 1 ? "" : "s"}`;
    else if (typeof v === "object") {
      const keys = Object.keys(v as object);
      display = `{${keys.length} field${keys.length === 1 ? "" : "s"}: ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "…" : ""}}`;
    } else {
      display = String(v);
    }
    out.push({ k: k.replace(/[_-]/g, " "), v: display });
  }
  return out;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit",
  });
}

function fmtLatency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function extractInputs(e: AuditEvent): Array<{ k: string; v: string }> {
  const p = e.payload as Record<string, unknown>;
  if (!p) return [];
  if (e.event_type === "service_invoked") return summarize(p.request, 6);
  if (e.event_type === "rule_evaluated" || e.event_type === "rule_skipped")
    return summarize((p as { inputs?: unknown }).inputs, 5);
  if (e.event_type === "agent_action") {
    const inputs = (p as { inputs?: unknown; inputs_summary?: string }).inputs;
    if (inputs) return summarize(inputs, 5);
    const summary = (p as { inputs_summary?: string }).inputs_summary;
    return summary ? [{ k: "inputs", v: summary }] : [];
  }
  return [];
}

function extractOutputs(e: AuditEvent): Array<{ k: string; v: string }> {
  const p = e.payload as Record<string, unknown>;
  if (!p) return [];
  if (e.event_type === "service_invoked") {
    const r = (p as { response?: unknown }).response;
    if (typeof r === "string") {
      try { return summarize(JSON.parse(r), 6); } catch { return [{ k: "response", v: r.slice(0, 80) }]; }
    }
    return summarize(r, 6);
  }
  if (e.event_type === "rule_evaluated") {
    const decision = (p as { decision?: string }).decision;
    const outputs = (p as { outputs?: unknown }).outputs;
    const result: Array<{ k: string; v: string }> = [];
    if (decision) result.push({ k: "decision", v: decision });
    return [...result, ...summarize(outputs, 4)];
  }
  if (e.event_type === "rule_skipped") {
    return [{ k: "skipped because", v: String((p as { reason?: string }).reason ?? "—") }];
  }
  if (e.event_type === "agent_action") {
    const outFull = (p as { output_full?: unknown }).output_full;
    if (outFull) return summarize(outFull, 5);
    const outSum = (p as { output_summary?: string }).output_summary;
    if (outSum) return [{ k: "output", v: outSum.length > 120 ? outSum.slice(0, 117) + "…" : outSum }];
    return [];
  }
  if (e.event_type === "decision_made") return summarize(p, 4);
  return summarize(p, 4);
}

// ── Components ─────────────────────────────────────────────────────────

const EventRow: React.FC<{ event: AuditEvent }> = ({ event }) => {
  const [expanded, setExpanded] = React.useState(false);
  const inputs = extractInputs(event);
  const outputs = extractOutputs(event);
  const title = eventTitle(event);
  const isSkipped = event.event_type === "rule_skipped";
  const isError =
    event.event_type === "service_invoked" &&
    typeof (event.payload as { response?: unknown })?.response === "object" &&
    (event.payload as { response?: { error?: unknown } }).response?.error !== undefined;

  return (
    <li className={`border-t border-rule first:border-t-0 ${isSkipped ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-paper-2"
      >
        <span className="mt-0.5 flex-shrink-0 text-ink-3">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <span className="mt-0.5 flex-shrink-0 text-ink-3">{eventIcon(event)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-body-sm font-semi text-ink-1">{title}</span>
            {isError && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-semantic-dangerTint px-1.5 py-0.5 font-mono text-mono-sm text-semantic-danger">
                <AlertCircle className="h-3 w-3" /> error
              </span>
            )}
            <span className="font-mono text-mono-sm text-ink-3">
              {fmtTime(event.occurred_at)}
            </span>
            {event.latency_ms != null && (
              <span className="font-mono text-mono-sm text-ink-3">
                · {fmtLatency(event.latency_ms)}
              </span>
            )}
            {typeof event.cost_usd === "number" && event.cost_usd > 0 && (
              <span className="font-mono text-mono-sm text-ink-3">
                · ${event.cost_usd.toFixed(4)}
              </span>
            )}
          </div>
          {/* Inline preview row: first received & first produced */}
          {!expanded && (inputs[0] || outputs[0]) && (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-mono-sm font-mono text-ink-3">
              {inputs[0] && (
                <span>
                  <span className="text-ink-4">in:</span> {inputs[0].k}={inputs[0].v}
                </span>
              )}
              {outputs[0] && (
                <span>
                  <span className="text-ink-4">out:</span> {outputs[0].k}={outputs[0].v}
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="ml-10 mr-4 mb-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-rule bg-paper-2/50 p-3">
            <p className="mb-2 text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
              Received
            </p>
            {inputs.length === 0 ? (
              <p className="text-mono-sm font-mono text-ink-4">No structured inputs.</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {inputs.map((kv, i) => (
                  <React.Fragment key={i}>
                    <dt className="font-mono text-mono-sm text-ink-3">{kv.k}</dt>
                    <dd className="font-mono text-mono-sm text-ink-1 break-words">{kv.v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
          </div>
          <div className="rounded-md border border-rule bg-paper-2/50 p-3">
            <p className="mb-2 text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
              Produced
            </p>
            {outputs.length === 0 ? (
              <p className="text-mono-sm font-mono text-ink-4">No structured output.</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {outputs.map((kv, i) => (
                  <React.Fragment key={i}>
                    <dt className="font-mono text-mono-sm text-ink-3">{kv.k}</dt>
                    <dd className="font-mono text-mono-sm text-ink-1 break-words">{kv.v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </li>
  );
};

const StageGroup: React.FC<{ stage: StageMeta; events: AuditEvent[]; defaultOpen?: boolean }> = ({
  stage, events, defaultOpen = false,
}) => {
  const [open, setOpen] = React.useState(defaultOpen);
  if (events.length === 0) return null;

  // Stage timing: earliest occurred_at to latest occurred_at
  const firstAt = events[0]?.occurred_at;
  const lastAt = events[events.length - 1]?.occurred_at;
  const totalLatency = events.reduce((s, e) => s + (e.latency_ms ?? 0), 0);
  const totalCost = events.reduce(
    (s, e) => s + (typeof e.cost_usd === "number" ? e.cost_usd : 0),
    0,
  );

  return (
    <section className="border-b border-rule last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-paper-2"
      >
        <span className="mt-0.5 flex-shrink-0 text-ink-3">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 className="text-body font-semi text-ink-1">{stage.label}</h3>
            <span className="font-mono text-mono-sm text-ink-3">
              {events.length} action{events.length === 1 ? "" : "s"}
            </span>
            {totalLatency > 0 && (
              <span className="font-mono text-mono-sm text-ink-3">
                · {fmtLatency(totalLatency)}
              </span>
            )}
            {totalCost > 0 && (
              <span className="font-mono text-mono-sm text-ink-3">
                · ${totalCost.toFixed(2)}
              </span>
            )}
            {firstAt && (
              <span className="font-mono text-mono-sm text-ink-3">
                · started {fmtTime(firstAt)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-body-sm text-ink-3">{stage.description}</p>
        </div>
      </button>
      {open && (
        <ul className="border-t border-rule bg-paper">
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </section>
  );
};

export const PipelineActivity: React.FC<Props> = ({ events }) => {
  const grouped = React.useMemo(() => {
    const byStage: Record<string, AuditEvent[]> = {};
    for (const stage of STAGES) byStage[stage.id] = [];
    for (const e of events) {
      const s = stageFor(e);
      if (byStage[s]) byStage[s].push(e);
      else byStage["intake"].push(e);
    }
    // Sort each stage by occurred_at ascending
    for (const k of Object.keys(byStage)) {
      byStage[k].sort(
        (a, b) =>
          new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
      );
    }
    return byStage;
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="rounded-md border border-rule bg-paper p-6 text-center">
        <p className="text-body-sm text-ink-3">
          No pipeline activity recorded yet. Events appear here as the
          orchestrator processes the application.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-rule bg-paper">
      <header className="border-b border-rule px-4 py-3">
        <h2 className="text-h4 font-semi text-ink-1">Pipeline activity</h2>
        <p className="mt-0.5 text-body-sm text-ink-3">
          What each stage did, what it received, what it produced. Click a row
          to expand.
        </p>
      </header>
      <div>
        {STAGES.map((stage) => (
          <StageGroup
            key={stage.id}
            stage={stage}
            events={grouped[stage.id] ?? []}
            defaultOpen
          />
        ))}
      </div>
    </div>
  );
};
