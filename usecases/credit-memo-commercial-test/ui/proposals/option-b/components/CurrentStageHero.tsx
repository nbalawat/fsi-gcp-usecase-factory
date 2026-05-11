import * as React from "react";
import {
  AgentMini,
  StatusBadge,
  StatCard,
  type AgentNode,
} from "@fsi-bank/components";
import {
  type StageView,
  stageLabel,
  gateLabel,
  gateDecision,
  relativeTime,
  AGENT_OUTPUT_STUBS,
  ATOMIC_SERVICE_STUBS,
  LIVE_CASE,
  PRIMARY_BORROWER,
} from "../lib/data";

export interface CurrentStageHeroProps {
  stage: StageView;
  caseId: string;
  /** Hero CTA href — e.g. into the approval flow. Omit to hide the CTA. */
  primaryActionHref?: string;
  /** Hero CTA label. */
  primaryActionLabel?: string;
}

/**
 * The hero panel — the 60% of the viewport that says
 *   "this is what's happening right now."
 *
 * It frames the current stage with:
 *   - a big stage title and elapsed-since-entered indicator
 *   - the agent or human activity at this stage (compact)
 *   - the canonical artifact for this stage
 *   - one primary action (link forward, e.g. into approval)
 *
 * No business logic — values come from mock-data verbatim, shaped by
 * `lib/data.ts`.
 */
export const CurrentStageHero: React.FC<CurrentStageHeroProps> = ({
  stage,
  caseId,
  primaryActionHref,
  primaryActionLabel,
}) => {
  const decision = stage.gate ? gateDecision(stage.gate) : undefined;
  const stageAgents = agentsForStage(stage.id);
  const services = servicesForStage(stage.id);
  const extracted = (ATOMIC_SERVICE_STUBS["document-extractor"] ?? {}) as {
    extracted_fields?: Record<string, unknown>;
    confidence?: number;
    page_count?: number;
  };

  return (
    <section
      id={`stage-${stage.id}`}
      aria-label={`Current stage: ${stageLabel(stage.id)}`}
      className="flex h-full flex-col gap-4 rounded-lg border border-rule bg-paper p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
        <div className="min-w-0">
          <div className="eyebrow">Current stage · {stage.index + 1} of 9</div>
          <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
            {stageLabel(stage.id)}
          </h1>
          <div className="mt-1 flex items-center gap-2 font-mono text-mono-sm text-ink-3">
            <span>entered {relativeTime(stage.enteredAt)}</span>
            <span aria-hidden>·</span>
            <span>{stage.eventCount} events</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {stage.gate && (
            <StatusBadge
              kind={decision?.decision === "approve" ? "success" : "accent"}
            >
              {gateLabel(stage.gate)}
              {decision ? ` · ${decision.decision}` : " · pending"}
            </StatusBadge>
          )}
          {primaryActionHref && primaryActionLabel && (
            <a
              href={primaryActionHref}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-ui font-medium text-paper hover:bg-accent-pressed"
            >
              {primaryActionLabel} →
            </a>
          )}
        </div>
      </header>

      {/* KPI strip — these values come from the mock-data extracted fields
          verbatim; rendered as StatCard for the page hero per ui-standards. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Borrower"
          value={PRIMARY_BORROWER.name}
          delta={`${PRIMARY_BORROWER.geo} · NAICS ${PRIMARY_BORROWER.naics}`}
          tone="neutral"
        />
        <StatCard
          label="Risk band"
          value={PRIMARY_BORROWER.risk_band}
          tone={
            PRIMARY_BORROWER.risk_band === "1-pass"
              ? "ok"
              : PRIMARY_BORROWER.risk_band === "2-special-mention"
                ? "warning"
                : "danger"
          }
          delta="canvas verdict"
        />
        <StatCard
          label="Extraction confidence"
          value={
            typeof extracted.confidence === "number"
              ? `${Math.round(extracted.confidence * 100)}%`
              : "—"
          }
          unit=""
          delta={`${extracted.page_count ?? 0} pages`}
          tone="ok"
        />
        <StatCard
          label="Decision"
          value={LIVE_CASE.decision}
          delta={LIVE_CASE.decision_kind}
          tone={LIVE_CASE.decision === "approve" ? "ok" : "warning"}
        />
      </div>

      {/* Two-column body — agents + services active at this stage */}
      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-5">
        <div className="md:col-span-3 flex flex-col gap-3 rounded-md border border-rule bg-paper-2 p-4">
          <div className="eyebrow">Stage artifact</div>
          <h2 className="font-serif text-h3 font-semi text-ink-1">
            {stageArtifactTitle(stage.id)}
          </h2>
          <p className="text-body text-ink-2 leading-relaxed">
            {stageArtifactSummary(stage.id)}
          </p>
          {extracted.extracted_fields && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ExtractedRow
                label="Revenue"
                value={fmtFromExtracted(
                  extracted.extracted_fields,
                  "income_statement.revenue"
                )}
                unit="M USD"
              />
              <ExtractedRow
                label="EBITDA"
                value={fmtFromExtracted(
                  extracted.extracted_fields,
                  "income_statement.ebitda"
                )}
                unit="M USD"
              />
              <ExtractedRow
                label="Total debt"
                value={fmtFromExtracted(
                  extracted.extracted_fields,
                  "balance_sheet.total_debt"
                )}
                unit="M USD"
              />
              <ExtractedRow
                label="Operating cash flow"
                value={fmtFromExtracted(
                  extracted.extracted_fields,
                  "cash_flow.operating_cash_flow"
                )}
                unit="M USD"
              />
            </div>
          )}
        </div>

        <div className="md:col-span-2 flex flex-col gap-3">
          <AgentMini
            pattern="extractor-spreader-rater-drafter@1.0"
            agents={stageAgents}
          />
          {services.length > 0 && (
            <section
              aria-label="Atomic services at this stage"
              className="rounded-md border border-rule bg-paper"
            >
              <header className="border-b border-rule px-3 py-2">
                <div className="eyebrow">Atomic services</div>
                <h3 className="font-mono text-mono-sm text-ink-1">
                  {services.length} invoked
                </h3>
              </header>
              <ul className="flex flex-col">
                {services.map((s) => (
                  <li
                    key={s}
                    className="flex items-center justify-between border-b border-rule px-3 py-2 font-mono text-mono-sm text-ink-2 last:border-b-0"
                  >
                    <span className="truncate">{s}</span>
                    <StatusBadge kind="success">done</StatusBadge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </section>
  );
};

const ExtractedRow: React.FC<{
  label: string;
  value: string;
  unit?: string;
}> = ({ label, value, unit }) => (
  <div className="rounded-sm border border-rule bg-paper px-3 py-2">
    <div className="eyebrow">{label}</div>
    <div className="mt-0.5 flex items-baseline gap-1">
      <span className="font-mono text-h4 font-semi tabular-nums text-ink-1">
        {value}
      </span>
      {unit && <span className="text-mono-sm text-ink-3">{unit}</span>}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage → agents / services / artifact mapping.
// Pure vocabulary — no calculations, no thresholds. Maps each stage to the
// archetype labels declared in the canvas (mock-data AGENT_OUTPUT_STUBS).
// ─────────────────────────────────────────────────────────────────────────────

function agentsForStage(stageId: string): AgentNode[] {
  const roleForStage: Record<string, string[]> = {
    intake: [],
    extracting: ["document-processor"],
    analyzing: ["analyst-multisection"],
    spreading: ["analyst-multisection"],
    rating: ["rater-with-covenant"],
    drafting: ["narrative-drafter"],
    reviewing: ["memo-reviewer-v2"],
    approval: ["memo-reviewer-v2"],
    done: [],
  };
  const roles = roleForStage[stageId] ?? [];
  return roles.map((role) => {
    const stub = (AGENT_OUTPUT_STUBS[role] ?? {}) as { _archetype_loaded?: boolean };
    return {
      id: role,
      role,
      status: stub._archetype_loaded ? "done" : "idle",
      message: `${role} archetype loaded`,
      model: role === "narrative-drafter" ? "claude-opus-4-7" : "gemini-3-1-flash",
    };
  });
}

function servicesForStage(stageId: string): string[] {
  const map: Record<string, string[]> = {
    intake: [],
    extracting: ["document-extractor"],
    analyzing: ["peer-and-industry-context", "borrower-network"],
    spreading: ["financial-spreader", "loan-serviceability"],
    rating: [],
    drafting: [],
    reviewing: [],
    approval: ["collateral-valuator"],
    done: [],
  };
  return map[stageId] ?? [];
}

function stageArtifactTitle(stageId: string): string {
  switch (stageId) {
    case "intake":
      return "Uploaded documents";
    case "extracting":
      return "Extracted financials (10-K)";
    case "analyzing":
      return "Peer & industry context";
    case "spreading":
      return "Financial spreads";
    case "rating":
      return "Risk-band proposal";
    case "drafting":
      return "Credit memo draft";
    case "reviewing":
      return "Reviewer findings";
    case "approval":
      return "Final approval packet";
    case "done":
      return "Decision recorded";
    default:
      return stageId;
  }
}

function stageArtifactSummary(stageId: string): string {
  switch (stageId) {
    case "intake":
      return "Documents received from the relationship manager. Includes 10-K and AR aging file.";
    case "extracting":
      return "Document-extractor pulled structured income, balance, and cash-flow data from the 10-K, with citations to source pages.";
    case "analyzing":
      return "Peer-and-industry-context and borrower-network services run in parallel to enrich the case before spreading.";
    case "spreading":
      return "Financial-spreader normalises five-year statements; loan-serviceability computes DSCR and leverage on the spread.";
    case "rating":
      return "Rater-with-covenant proposes a risk band reading the spread, peer context, and four shared rules.";
    case "drafting":
      return "Narrative-drafter produces the credit memo with inline citations, ready for analyst review.";
    case "reviewing":
      return "Memo-reviewer-v2 critiques the draft for missing citations, contradictions, and policy gaps.";
    case "approval":
      return "Credit officer signs off on the final packet at the approval gate.";
    case "done":
      return "Decision recorded and dispatched to the sink.";
    default:
      return "Stage in progress.";
  }
}

function fmtFromExtracted(
  obj: Record<string, unknown>,
  path: string
): string {
  // Defensive read — does not mutate or compute.
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return "—";
    }
  }
  if (typeof cur === "number") return cur.toLocaleString("en-US");
  if (typeof cur === "string") return cur;
  return "—";
}
