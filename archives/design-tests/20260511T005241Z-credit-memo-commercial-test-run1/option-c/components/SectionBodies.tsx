import * as React from "react";
import {
  StatusBadge,
  AgentReasoningPanel,
} from "@fsi-bank/components";
import type { ReasoningFactor } from "@fsi-bank/components";
import {
  extractedHeadline,
  serviceRows,
  agentRows,
  ruleRows,
  ATOMIC_SERVICE_STUBS,
  AGENT_OUTPUT_STUBS,
} from "../lib/data";

// All bodies are PURE PRESENTATION — read values from canvas mock
// data verbatim and render them. No math, no thresholds, no decisions.

// ────────────────────────────────────────────────────────────────────────
export const ExtractionBody: React.FC = () => {
  const h = extractedHeadline();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Revenue (FY2024)" value={fmtMoney(h.revenue)} />
      <Field label="EBITDA (FY2024)" value={fmtMoney(h.ebitda)} />
      <Field label="Interest expense" value={fmtMoney(h.interest)} />
      <Field label="Total debt" value={fmtMoney(h.debt)} />
      <Field label="Total equity" value={fmtMoney(h.equity)} />
      <Field
        label="Pages parsed"
        value={h.pages !== null ? `${h.pages}` : "—"}
      />
      <div className="md:col-span-2 rounded border border-rule bg-paper-2 p-3">
        <div className="font-mono text-mono-sm text-ink-3">citation</div>
        <p className="mt-1 text-body-sm text-ink-1">
          “Net sales totaled $4,233.0 million in 2024”
        </p>
        <div className="mt-1 font-mono text-mono-sm text-ink-3">
          source: 10-K · page 18 · chunk ch_42
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
export const SpreadBody: React.FC = () => {
  const services = serviceRows();
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ink-2">
        Atomic services that ran on this case. The spread numbers below
        are what feeds the rating; if any of them are off, flag here.
      </p>
      <ul className="divide-y divide-rule rounded border border-rule">
        {services.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between px-3 py-2"
          >
            <span className="font-mono text-mono-sm text-ink-1">
              {s.label}
            </span>
            <StatusBadge kind={s.status === "ran" ? "success" : "neutral"}>
              {s.status}
            </StatusBadge>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
export const PeerBody: React.FC = () => (
  <div className="space-y-3">
    <p className="text-body-sm text-ink-2">
      Peer benchmark — sourced from peer-and-industry-context. Borrower
      sits in NAICS 33 (manufacturing).
    </p>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Field label="Industry median DSCR" value="1.75x" />
      <Field label="Borrower DSCR" value="2.21x" />
      <Field label="Peer rank" value="top quartile" />
    </div>
    <div className="rounded border border-rule bg-paper-2 p-3 text-body-sm text-ink-2">
      Service stub returned by canvas; numbers are illustrative and
      come from the canvas mock — not computed in the UI.
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────────
export const CollateralBody: React.FC = () => {
  const stub = ATOMIC_SERVICE_STUBS["collateral-valuator"];
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ink-2">
        Pledged inventory + accounts receivable. Coverage ratio rendered
        verbatim from collateral-valuator.
      </p>
      <pre className="overflow-x-auto rounded bg-paper-2 p-3 font-mono text-mono-sm text-ink-2">
        {JSON.stringify(stub, null, 2)}
      </pre>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
export const BorrowerNetworkBody: React.FC = () => (
  <div className="space-y-3">
    <p className="text-body-sm text-ink-2">
      Related-party exposure surfaces single-borrower concentration and
      Reg O insider flags.
    </p>
    <ul className="space-y-2">
      <li className="flex items-center justify-between rounded border border-rule px-3 py-2">
        <span className="text-body-sm text-ink-1">
          Single-borrower exposure
        </span>
        <StatusBadge kind="warning">watch</StatusBadge>
      </li>
      <li className="flex items-center justify-between rounded border border-rule px-3 py-2">
        <span className="text-body-sm text-ink-1">Reg O individual limit</span>
        <StatusBadge kind="success">pass</StatusBadge>
      </li>
    </ul>
  </div>
);

// ────────────────────────────────────────────────────────────────────────
export const RatingBody: React.FC = () => {
  const factors: ReasoningFactor[] = [
    {
      name: "DSCR coverage",
      weight: 0.35,
      evidence:
        "DSCR 2.21x exceeds industry threshold; operating cash flow $712M against debt service.",
      source: "financial-spreader",
      band: "ok",
    },
    {
      name: "Leverage profile",
      weight: 0.3,
      evidence:
        "Total debt $720M against equity $1,969M; debt/EBITDA below industry median.",
      source: "financial-spreader",
      band: "ok",
    },
    {
      name: "Customer concentration",
      weight: 0.15,
      evidence:
        "Top-1 customer 8%, top-5 24% — diversified relative to peers.",
      source: "document-extractor",
      band: "ok",
    },
    {
      name: "Management continuity",
      weight: 0.1,
      evidence: "CEO tenure 12y, CFO 4y; no recent C-suite turnover.",
      source: "document-extractor",
      band: "ok",
    },
    {
      name: "Industry headwind",
      weight: 0.1,
      evidence:
        "Manufacturing NAICS 33 showing soft demand; offset by backlog.",
      source: "peer-and-industry-context",
      band: "warning",
    },
  ];
  return (
    <AgentReasoningPanel
      step="rater-with-covenant"
      factors={factors}
      confidence={0.88}
      citationDensity={0.86}
      rationale={
        "Recommended internal rating: 1-pass. Coverage and leverage are solid; one watch factor on industry headwind."
      }
    />
  );
};

// ────────────────────────────────────────────────────────────────────────
export const RulesBody: React.FC = () => {
  const rules = ruleRows();
  return (
    <ul className="divide-y divide-rule rounded border border-rule">
      {rules.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between px-3 py-2"
        >
          <span className="font-mono text-mono-sm text-ink-1">{r.id}</span>
          <StatusBadge kind={verdictTone(r.verdict)}>{r.verdict}</StatusBadge>
        </li>
      ))}
    </ul>
  );
};

// ────────────────────────────────────────────────────────────────────────
export const DraftBody: React.FC = () => {
  const agents = agentRows();
  return (
    <div className="space-y-4">
      <article className="space-y-3 rounded border border-rule bg-paper-2 p-4 text-body-sm text-ink-1 leading-relaxed">
        <p>
          <strong>Lincoln Electric Holdings</strong> — recommended for
          a <strong>$25M committed revolver</strong>, 364-day tenor,
          secured by inventory and receivables, priced at SOFR + 175 bps.
        </p>
        <p>
          The borrower is a top-quartile manufacturer with DSCR of 2.21x
          and total debt of $720M against equity of $1,969M. Customer
          concentration is diversified at 8% top-1. Recommended internal
          rating: <em>1-pass</em>. One watch factor: industry-wide
          softness in NAICS 33 partially offset by a strong backlog.
        </p>
        <p>
          Covenants: minimum DSCR 1.25x, max leverage 3.5x, quarterly
          compliance certificates. Single-borrower exposure flagged for
          monitoring (not breach).
        </p>
      </article>
      <div>
        <div className="mb-2 font-mono text-mono-sm text-ink-3">
          authoring agents
        </div>
        <ul className="flex flex-wrap gap-2">
          {agents.map((a) => (
            <li
              key={a.id}
              className="rounded border border-rule bg-paper px-2 py-1 font-mono text-mono-sm text-ink-2"
            >
              {a.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
export const FinalBody: React.FC = () => {
  const reviewer = AGENT_OUTPUT_STUBS["memo-reviewer-v2"];
  return (
    <div className="space-y-3">
      <div className="rounded border border-rule bg-paper-2 p-4">
        <div className="font-mono text-mono-sm text-ink-3">recommendation</div>
        <div className="mt-1 font-serif text-h3 text-ink-1">APPROVE</div>
        <p className="mt-2 text-body-sm text-ink-2">
          Approval authority required: credit officer (per
          approval_matrix_commercial). Once approved here, the memo
          ships to the closing queue.
        </p>
      </div>
      <details className="rounded border border-rule px-3 py-2 text-body-sm text-ink-2">
        <summary className="cursor-pointer text-ink-1">
          Reviewer agent stub
        </summary>
        <pre className="mt-2 overflow-x-auto bg-paper-2 p-2 font-mono text-mono-sm">
          {JSON.stringify(reviewer, null, 2)}
        </pre>
      </details>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="rounded border border-rule bg-paper p-3">
    <div className="font-mono text-mono-sm uppercase tracking-wide text-ink-3">
      {label}
    </div>
    <div className="mt-1 font-serif text-h3 font-semi text-ink-1">
      {value}
    </div>
  </div>
);

const verdictTone = (
  v: "pass" | "watch" | "fail" | "skip",
): "success" | "warning" | "danger" | "neutral" => {
  if (v === "pass") return "success";
  if (v === "watch") return "warning";
  if (v === "fail") return "danger";
  return "neutral";
};

// Format a number in millions (the canvas extracted_fields are in
// millions). Returns "—" if null.
const fmtMoney = (n: number | null): string => {
  if (n === null || n === undefined) return "—";
  return `$${n.toLocaleString("en-US")}M`;
};
