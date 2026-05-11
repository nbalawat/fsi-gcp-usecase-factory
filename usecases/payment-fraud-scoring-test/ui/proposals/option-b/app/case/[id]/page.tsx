import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatCard,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@fsi-bank/components";
import { ModelHero } from "../../../components/ModelHero";
import { FeatureFilterBar } from "../../../components/FeatureFilterBar";
import { SampleContribution } from "../../../components/SampleContribution";
import { LiveTicker } from "../../../components/LiveTicker";
import {
  BAND_THRESHOLDS,
  CANVAS_SHA256,
  DECISION_TALLY,
  FEATURES,
  MODEL,
  MODEL_PROVIDER,
  PIPELINE_EVENTS,
  RULE_VERDICTS,
  SCORE_HISTOGRAM,
  SHARED_RULES,
  USE_CASE_ID,
  bandBadge,
  bucketIndexForScore,
  getSample,
  maxBucketCount,
  toLiveEvents,
  totalSampleCount,
  verdictBadge,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

// Banker-readable rule labels (no business logic — just renaming).
const RULE_LABEL: Record<string, string> = {
  velocity_threshold_by_mcc: "Velocity threshold by MCC",
  decline_band_floor: "Decline-band floor",
  approve_band_ceiling: "Approve-band ceiling",
  geo_country_block_list: "Geo country block list",
};

const NAV: NavItem[] = [
  { id: "model",   label: "Model health", icon: "layout-dashboard", href: "/" },
  { id: "case",    label: "This sample",  icon: "inbox" },
  { id: "policy",  label: "Policy tuning", icon: "git-branch", href: "/approval/policy" },
  { id: "agents",  label: "Agents",       icon: "bot" },
];

export default function CaseDetailPage({ params }: PageProps): React.ReactElement {
  const s = getSample(params.id);
  const liveRows = toLiveEvents(PIPELINE_EVENTS);
  const highlightIdx = bucketIndexForScore(s.score);
  const total = totalSampleCount();
  const maxBkt = maxBucketCount();

  // Surface metrics — every value comes from the mock data verbatim.
  // No ratios computed, no thresholds checked in this component.
  const metrics: Metric[] = [
    {
      id: "model",
      label: "Model",
      value: `${MODEL.name} ${MODEL.version}`,
      tooltip: `Champion model · trained ${MODEL.trained_at.substring(0, 10)}`,
    },
    {
      id: "p99",
      label: "p99 latency",
      value: DECISION_TALLY.p99_latency_ms,
      unit: "ms",
      state: "ok",
    },
    {
      id: "share",
      label: "Agent share",
      value: `${DECISION_TALLY.agent_share_pct.toFixed(1)}%`,
      tooltip: "Share of tx routed to the gray-zone agent in the last hour",
    },
    {
      id: "drift",
      label: "24h decline drift",
      value: `${DECISION_TALLY.drift_pp_24h > 0 ? "+" : ""}${DECISION_TALLY.drift_pp_24h.toFixed(1)} pp`,
      trend: DECISION_TALLY.drift_pp_24h > 0 ? 1 : DECISION_TALLY.drift_pp_24h < 0 ? -1 : 0,
      state: Math.abs(DECISION_TALLY.drift_pp_24h) >= 5 ? "warning" : "ok",
    },
    {
      id: "score",
      label: "this score",
      value: s.score.toFixed(2),
      state:
        s.band === "decline"
          ? "alert"
          : s.band === "gray"
            ? "warning"
            : "ok",
    },
  ];

  const policyHref = `/approval/policy`;

  return (
    <AppShell
      brand="Fraud Scoring"
      subtitle="Model health"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="case"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="Fraud Scoring"
        caseId={s.id}
        backHref="/"
        backLabel="Model health"
      />

      {/* Hero — one transaction, framed as one sample on the model's curve. */}
      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Sample</div>
            <h1 className="font-serif text-h2 font-semi text-ink-1">
              ${s.amount_usd.toLocaleString(undefined, { minimumFractionDigits: 2 })} · {s.merchant}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-mono-sm text-ink-3">
              <span>{s.id}</span>
              <span>·</span>
              <span>MCC {s.mcc}</span>
              <span>·</span>
              <span>card …{s.card_last4}</span>
              <span>·</span>
              <span>{s.card_country} → {s.acquirer_country}</span>
              <span>·</span>
              <span>{s.at.substring(11, 23)} UTC</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind={bandBadge(s.band)}>band: {s.band}</StatusBadge>
            <StatusBadge
              kind={
                s.decision === "approve"
                  ? "success"
                  : s.decision === "decline"
                    ? "danger"
                    : "warning"
              }
            >
              {s.decision}
            </StatusBadge>
            <a
              href={policyHref}
              className="rounded-sm bg-accent px-3 py-1.5 font-mono text-mono-sm text-paper hover:opacity-90"
            >
              Tune policy →
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        {/* Main column — the model IS the page. */}
        <div className="flex flex-col gap-4">
          <ModelHero
            histogram={SCORE_HISTOGRAM}
            thresholds={BAND_THRESHOLDS}
            highlightIdx={highlightIdx}
            highlightLabel={`${s.id} · ${s.score.toFixed(2)}`}
            totalSamples={total}
            maxBucketCount={maxBkt}
          />

          <SampleContribution
            contributions={s.contributions}
            featureCatalogue={FEATURES}
          />

          {/* Agent reasoning — only when the gray-zone agent was invoked. */}
          {s.agent_invoked && s.agent_rationale && (
            <section
              aria-label="Agent reasoning"
              className="rounded-md border border-rule bg-paper"
            >
              <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
                <div>
                  <div className="eyebrow">Gray-zone agent</div>
                  <h2 className="font-serif text-h3 font-semi text-ink-1">
                    {s.agent_id}
                  </h2>
                </div>
                <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
                  conf {s.agent_confidence?.toFixed(2)} · {s.latency_ms}ms
                </span>
              </header>
              <p className="px-4 py-3 text-body text-ink-2">
                {s.agent_rationale}
              </p>
            </section>
          )}

          <FeatureFilterBar features={FEATURES} />

          <LiveTicker rows={liveRows} />
        </div>

        {/* Right rail — rule verdicts + canvas pin. */}
        <aside className="flex flex-col gap-4">
          <section
            aria-label="Rule verdicts"
            className="rounded-md border border-rule bg-paper"
          >
            <header className="border-b border-rule px-3 py-2">
              <div className="eyebrow">Rules engine</div>
              <h3 className="text-h4 font-semi text-ink-1">Verdicts</h3>
            </header>
            <ul className="flex flex-col">
              {SHARED_RULES.map((r) => {
                const v = RULE_VERDICTS[r] ?? "skip";
                return (
                  <li
                    key={r}
                    className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2 last:border-b-0"
                  >
                    <span className="text-ui text-ink-1">
                      {RULE_LABEL[r] ?? r}
                    </span>
                    <StatusBadge kind={verdictBadge(v)}>{v}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          </section>

          <StatCard
            label="Decisions · last hour"
            value={DECISION_TALLY.auto_approve.toLocaleString()}
            unit="approved"
            delta={`${DECISION_TALLY.gray.toLocaleString()} gray · ${DECISION_TALLY.auto_decline.toLocaleString()} declined`}
            tone="neutral"
          />

          <StatCard
            label="Canvas SHA-256"
            value={`${CANVAS_SHA256.substring(0, 8)}…`}
            unit="pinned"
            delta={`${MODEL_PROVIDER} · advisory`}
            tone="neutral"
          />
        </aside>
      </div>
    </AppShell>
  );
}
