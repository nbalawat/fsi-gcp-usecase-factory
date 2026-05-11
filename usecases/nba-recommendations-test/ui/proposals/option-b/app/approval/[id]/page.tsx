import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatusBadge,
  type NavItem,
} from "../../../components/primitives";
import { CustomerTimeline } from "../../../components/CustomerTimeline";
import { EvidenceChips } from "../../../components/EvidenceChips";
import { DispositionClient } from "../../../components/DispositionClient";
import {
  getRecommendation,
  getCustomer,
  RECOMMENDATIONS,
  HITL_GATES,
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

export default function ApprovalPage({ params }: PageProps): React.ReactElement {
  const id = params.id;
  const rec = getRecommendation(id) ?? RECOMMENDATIONS[0];
  const customer = getCustomer(rec.customerId);

  if (!customer) {
    return (
      <AppShell brand="NBA · Customer 360" subtitle="Approval" nav={NAV} active="queue">
        <main className="p-12 text-ink-2">No customer matches {id}.</main>
      </AppShell>
    );
  }

  // Determine which HITL gate applies. RM disposition always; credit
  // review when exposure adjustment is meaningful (here keyed off
  // proposalSize prefix). Pure read — no business logic.
  const requiresCreditReview = rec.type === "extension" || rec.type === "rate-reset";
  const activeGates = requiresCreditReview ? HITL_GATES : HITL_GATES.slice(0, 1);

  return (
    <AppShell brand="NBA · Customer 360" subtitle="Approval flow" nav={NAV} active="queue">
      <BreadcrumbNav
        crumbs={[
          { label: "Recommendations", href: "/" },
          { label: customer.name,     href: `/case/${rec.id}` },
          { label: "Approval" },
        ]}
      />

      <MetricStrip
        metrics={[
          { id: "rec",       label: "Recommendation", value: rec.typeLabel },
          { id: "customer",  label: "Customer",       value: customer.name },
          { id: "urgency",   label: "Urgency",        value: rec.urgency, state: rec.urgency === "urgent" ? "alert" : rec.urgency === "attention" ? "warning" : "ok" },
          { id: "size",      label: "Proposed size",  value: rec.proposalSize },
          { id: "authority", label: "Authority",      value: rec.approvalAuthority },
        ]}
      />

      <main className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <section className="flex flex-col gap-5 lg:col-span-2">
          <article className="flex flex-col gap-4 rounded-md border border-rule bg-paper p-5">
            <header className="flex flex-wrap items-baseline gap-3">
              <div>
                <div className="eyebrow">The story</div>
                <h2 className="font-serif text-h2 font-semi text-ink-1">
                  {rec.headline}
                </h2>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <StatusBadge kind={rec.urgency === "urgent" ? "danger" : "warning"}>
                  {rec.urgency}
                </StatusBadge>
              </div>
            </header>

            <p className="font-serif text-ui leading-relaxed text-ink-1">
              {rec.story}
            </p>

            <CustomerTimeline events={rec.timeline} />

            <div className="grid grid-cols-1 gap-3 rounded-md border border-rule bg-paper-2 p-3 md:grid-cols-3">
              <Block eyebrow="Proposed" body={rec.proposal} mono={rec.proposalSize} />
              <Block eyebrow="Impact"   body={rec.impact} />
              <Block eyebrow="Routes to" body={rec.routeTo} mono={`Authority: ${rec.approvalAuthority}`} />
            </div>

            <EvidenceChips chips={rec.evidence} confidence={rec.confidence} />
          </article>

          <section
            aria-label="HITL gates"
            className="flex flex-col gap-3 rounded-md border border-rule bg-paper p-5"
          >
            <header>
              <div className="eyebrow">Required gates</div>
              <h3 className="font-serif text-h3 font-semi text-ink-1">
                Human-in-the-loop checks for this recommendation
              </h3>
            </header>
            <ol className="flex flex-col gap-3">
              {activeGates.map((g, i) => (
                <li
                  key={g.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-rule px-3 py-2"
                >
                  <span className="font-mono text-mono-sm tabular-nums text-ink-3">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-serif text-ui font-semi text-ink-1">
                    {g.label}
                  </span>
                  <span className="text-ui text-ink-2">— {g.triggers}</span>
                  <span className="ml-auto">
                    <StatusBadge kind={i === 0 ? "warning" : "neutral"}>
                      {i === 0 ? "Awaiting you" : "Queued"}
                    </StatusBadge>
                  </span>
                  <div className="basis-full font-mono text-mono-sm text-ink-3">
                    Authority: {g.authority}
                  </div>
                </li>
              ))}
            </ol>
          </section>

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
        </section>

        <aside
          aria-label="Relationship side panel"
          className="flex flex-col gap-4 rounded-md border border-rule bg-paper-2 p-4"
        >
          <header>
            <div className="eyebrow">Relationship</div>
            <h3 className="font-serif text-h3 font-semi text-ink-1">{customer.name}</h3>
          </header>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-ui">
            <dt className="text-ink-3">RM</dt><dd className="text-ink-1">{customer.rm}</dd>
            <dt className="text-ink-3">Segment</dt><dd className="text-ink-1">{customer.segment}</dd>
            <dt className="text-ink-3">Industry</dt><dd className="text-ink-1">{customer.industry}</dd>
            <dt className="text-ink-3">Geo</dt><dd className="text-ink-1">{customer.geo}</dd>
            <dt className="text-ink-3">Exposure</dt>
            <dd className="font-mono tabular-nums text-ink-1">
              {fmtMoney(customer.exposure_usd)}
            </dd>
          </dl>
          <footer className="mt-2 border-t border-rule pt-3 font-mono text-mono-sm text-ink-3">
            canvas {CANVAS_SHA256.substring(0, 12)}…
          </footer>
        </aside>
      </main>
    </AppShell>
  );
}

const Block: React.FC<{ eyebrow: string; body: string; mono?: string }> = ({
  eyebrow,
  body,
  mono,
}) => (
  <div>
    <div className="eyebrow">{eyebrow}</div>
    <div className="font-serif text-ui text-ink-1">{body}</div>
    {mono && <div className="mt-1 font-mono text-mono-sm text-ink-2 tabular-nums">{mono}</div>}
  </div>
);

const fmtMoney = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
