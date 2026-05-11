import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatusBadge,
  type NavItem,
} from "../../../components/primitives";
import { NarrativeCard } from "../../../components/NarrativeCard";
import { DispositionClient } from "../../../components/DispositionClient";
import { RightRail } from "../../../components/RightRail";
import {
  getRecommendation,
  getCustomer,
  RECOMMENDATIONS,
  CANVAS_SHA256,
} from "../../../lib/data";

const NAV: NavItem[] = [
  { id: "queue",     label: "Recommendations", href: "/",         icon: "inbox", badge: RECOMMENDATIONS.length },
  { id: "customers", label: "Customer 360",    href: "/customers", icon: "users" },
  { id: "activity",  label: "Live activity",   href: "/activity",  icon: "activity" },
  { id: "patterns",  label: "Accept patterns", href: "/patterns",  icon: "bar-chart" },
  { id: "agent",     label: "Agent traces",    href: "/agent",     icon: "bot" },
];

interface PageProps {
  params: { id: string };
}

export default function CasePage({ params }: PageProps): React.ReactElement {
  const id = params.id;
  // Defensive lookup — schema drift is real (Rule 14). Falls back to the
  // first recommendation so the page always renders.
  const rec = getRecommendation(id) ?? RECOMMENDATIONS[0];
  const customer = getCustomer(rec.customerId);

  if (!customer) {
    return (
      <AppShell brand="NBA · Customer 360" subtitle="Case" nav={NAV} active="queue">
        <main className="p-12 text-ink-2">
          No customer matches recommendation {id}.
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell brand="NBA · Customer 360" subtitle="Case" nav={NAV} active="queue">
      <BreadcrumbNav
        crumbs={[
          { label: "Recommendations", href: "/" },
          { label: customer.name },
          { label: rec.typeLabel },
        ]}
      />

      <MetricStrip
        metrics={[
          { id: "exposure",   label: "Relationship size", value: fmtMoney(customer.exposure_usd) },
          { id: "segment",    label: "Segment",           value: customer.segment },
          { id: "industry",   label: "Industry",          value: customer.industry },
          { id: "rm",         label: "RM",                value: customer.rm },
          { id: "confidence", label: "Agent confidence",  value: `${Math.round(rec.confidence * 100)}%`, unit: "" },
        ]}
      />

      <div className="flex flex-col lg:flex-row">
        <section
          aria-label={`Recommendation ${rec.id} — ${customer.name}`}
          className="flex-1 px-6 py-6"
        >
          <header className="mb-4 flex flex-wrap items-baseline gap-3">
            <div>
              <div className="eyebrow">Recommendation · {rec.id}</div>
              <h1 className="font-serif text-h1 font-semi text-ink-1">
                {customer.name}
              </h1>
              <p className="mt-1 text-ui text-ink-3">
                The customer relationship is the story. Read it top-to-bottom, then act at the bottom.
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <StatusBadge kind={rec.urgency === "urgent" ? "danger" : rec.urgency === "attention" ? "warning" : "neutral"}>
                {rec.urgency}
              </StatusBadge>
              <StatusBadge kind="accent">{rec.typeLabel}</StatusBadge>
            </div>
          </header>

          <NarrativeCard
            rec={rec}
            customer={customer}
            disposition={
              <DispositionClient
                caseId={rec.id}
                recommendation={{
                  decision: "ACCEPT",
                  rationaleSummary: rec.proposal,
                  routeTo: rec.routeTo,
                  approvalAuthority: rec.approvalAuthority,
                  irrevocable: rec.irrevocable ?? false,
                }}
              />
            }
          />

          <footer className="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-4 font-mono text-mono-sm text-ink-3">
            <span>use_case = nba-recommendations-test</span>
            <span>·</span>
            <span>canvas = {CANVAS_SHA256.substring(0, 12)}…</span>
            <span>·</span>
            <a href={`/approval/${rec.id}`} className="text-accent-pressed hover:underline">
              Open full approval flow →
            </a>
          </footer>
        </section>

        <RightRail />
      </div>
    </AppShell>
  );
}

const fmtMoney = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
