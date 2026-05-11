import * as React from "react";
import { CaseCard, StatusBadge } from "@fsi-bank/components";
import { DispositionButtons } from "./DispositionButtons";
import {
  dispositionBadgeKind,
  dispositionLabel,
  expiryUrgency,
  formatExpiryShort,
  fmtUsdCompact,
  type Recommendation,
} from "../lib/data";

export interface RecDetailProps {
  rec: Recommendation;
}

/**
 * Detail view for a single recommendation. The seed says detail
 * "is for when the RM wants to drill in" — so we expand on what
 * was already on the row: full rationale, agent context, the
 * fit/uplift/regulatory triad, and the same disposition buttons.
 *
 * Server component (no client interactivity at this level) — only
 * DispositionButtons is a client island.
 */
export const RecDetail: React.FC<RecDetailProps> = ({ rec }) => {
  const urgency = expiryUrgency(rec.expiresAt);
  const sendHref = `/approval/${rec.id}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Top — borrower CaseCard at detail view + the action / dispose */}
      <section
        aria-label="Recommendation header"
        className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]"
      >
        <CaseCard
          id={rec.borrower.id}
          borrowerId={rec.borrower.id}
          borrowerName={rec.borrower.name}
          stage={rec.disposition}
          riskBand={rec.borrower.risk_band as Recommendation["borrower"]["risk_band"]}
          conf={rec.confidence}
          view="detail"
          stageEnteredAt={rec.producedAt.substring(0, 10)}
        />

        <div className="flex flex-col gap-3 rounded-md border border-rule bg-paper p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow">Recommended action</div>
              <h2 className="font-serif text-h2 font-semi text-ink-1">
                {rec.actionLabel}
              </h2>
              <p className="mt-2 text-body-sm text-ink-2">{rec.rationale}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge kind={dispositionBadgeKind(rec.disposition)}>
                {dispositionLabel(rec.disposition)}
              </StatusBadge>
              {!rec.regulatoryClear && (
                <StatusBadge kind="warning">Regulatory watch</StatusBadge>
              )}
            </div>
          </div>

          {/* Disposition buttons — same inline controls as the queue row.
              On the detail page they sit at the bottom of the header. */}
          <div className="flex items-center justify-end border-t border-rule pt-3">
            <DispositionButtons
              recId={rec.id}
              disposition={rec.disposition}
              sendHref={sendHref}
            />
          </div>
        </div>
      </section>

      {/* Numeric strip — display the three canvas-pinned key metrics. */}
      <section
        aria-label="Recommendation metrics"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Metric
          label="Confidence"
          value={`${(rec.confidence * 100).toFixed(0)}%`}
          sub="model uplift_score"
        />
        <Metric
          label="Fit score"
          value={`${(rec.fitScore * 100).toFixed(0)}%`}
          sub="customer-product match"
        />
        <Metric
          label="Annualised uplift"
          value={fmtUsdCompact(rec.upliftUsd)}
          sub="estimated, not posted"
        />
        <Metric
          label="Expires"
          value={formatExpiryShort(rec.expiresAt)}
          sub={urgency === "critical" ? "act now" : urgency === "soon" ? "soon" : "ample time"}
          tone={urgency}
        />
      </section>

      {/* Agent activity — short list of where this rec came from. */}
      <section
        aria-label="Agent activity"
        className="rounded-md border border-rule bg-paper"
      >
        <header className="border-b border-rule px-4 py-3">
          <div className="eyebrow">Where this came from</div>
          <h3 className="font-serif text-h3 font-semi text-ink-1">
            Agent reasoning trail
          </h3>
        </header>
        <ul className="flex flex-col">
          <ActivityRow
            actor="service"
            label="peer-and-industry-context"
            detail="Loaded NAICS peer-set, geo-cohort, and risk-band benchmarks."
          />
          <ActivityRow
            actor="service"
            label="exposure-aggregator"
            detail={`Confirmed ${rec.borrower.name} aggregate exposure is within single-borrower limit.`}
          />
          <ActivityRow
            actor="agent"
            label="next-best-action recommender"
            detail={`Selected "${rec.actionLabel}" with confidence ${(rec.confidence * 100).toFixed(0)}% based on fit ${(rec.fitScore * 100).toFixed(0)}%.`}
          />
          <ActivityRow
            actor="rule"
            label="regulatory-clearance"
            detail={
              rec.regulatoryClear
                ? "Pass — action is allowed under current product and customer scope."
                : "Watch — borrower carries an upstream risk-band flag; RM judgment required."
            }
          />
        </ul>
      </section>
    </div>
  );
};

interface MetricProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "critical" | "soon" | "ok";
}
const Metric: React.FC<MetricProps> = ({ label, value, sub, tone }) => {
  const toneClass =
    tone === "critical"
      ? "text-status-critical"
      : tone === "soon"
        ? "text-status-warning"
        : "text-ink-1";
  return (
    <div className="rounded-md border border-rule bg-paper p-3">
      <div className="eyebrow">{label}</div>
      <div className={`mt-1 font-serif text-h2 font-semi ${toneClass}`}>
        {value}
      </div>
      {sub && <div className="font-mono text-mono-sm text-ink-3">{sub}</div>}
    </div>
  );
};

const ACTOR_BADGE: Record<
  "service" | "agent" | "rule",
  { label: string; kind: "info" | "accent" | "neutral" }
> = {
  service: { label: "service", kind: "info" },
  agent:   { label: "agent",   kind: "accent" },
  rule:    { label: "rule",    kind: "neutral" },
};

interface ActivityRowProps {
  actor: "service" | "agent" | "rule";
  label: string;
  detail: string;
}
const ActivityRow: React.FC<ActivityRowProps> = ({ actor, label, detail }) => {
  const b = ACTOR_BADGE[actor];
  return (
    <li className="grid grid-cols-[7rem_12rem_1fr] items-start gap-3 border-b border-rule px-4 py-3 last:border-b-0">
      <span>
        <StatusBadge kind={b.kind}>{b.label}</StatusBadge>
      </span>
      <span className="font-mono text-mono-sm text-ink-1">{label}</span>
      <span className="text-body-sm text-ink-2">{detail}</span>
    </li>
  );
};
