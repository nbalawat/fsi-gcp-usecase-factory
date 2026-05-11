import * as React from "react";
import {
  AppShell,
  BreadcrumbNav,
  MetricStrip,
  StatusBadge,
  type Metric,
  type NavItem,
} from "@primitives";
import { SendToCustomerClient } from "../../../components/SendToCustomerClient";
import {
  CANVAS_SHA256,
  MODEL_PROVIDER,
  USE_CASE_ID,
  getRecommendation,
} from "../../../lib/data";

interface PageProps {
  params: { id: string };
}

const NAV: NavItem[] = [
  { id: "queue", label: "Queue", icon: "inbox", href: "/" },
  { id: "approval", label: "Approval flow", icon: "send" },
  { id: "agents", label: "Agents", icon: "bot" },
];

export default function ApprovalPage({
  params,
}: PageProps): React.ReactElement {
  const id = decodeURIComponent(params.id);
  const rec = getRecommendation(id);
  const caseHref = `/case/${encodeURIComponent(rec.id)}`;

  const metrics: Metric[] = [
    { id: "uplift", label: "Uplift", value: rec.uplift_score, unit: "/100" },
    { id: "fit", label: "Fit", value: rec.fit_score, unit: "/100" },
    {
      id: "reg",
      label: "Reg clear",
      value: rec.regulatory_clear,
      state: rec.regulatory_clear === "clear" ? "ok" : "warning",
    },
    { id: "stage", label: "Stage", value: rec.stage },
    { id: "gate", label: "Gate", value: "rm_send_to_customer", state: "alert" },
  ];

  return (
    <AppShell
      brand="Next Best Action"
      subtitle="Send to customer · irrevocable"
      context={`${USE_CASE_ID} · ${MODEL_PROVIDER}`}
      nav={NAV}
      active="approval"
    >
      <BreadcrumbNav
        usecase={USE_CASE_ID}
        usecaseLabel="NBA Recommendations"
        caseId={rec.id}
        borrowerName={rec.borrower.name}
        backHref={caseHref}
        backLabel="Back to case"
      />

      <header className="border-b border-rule bg-semantic-warningTint px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Irrevocable gate</div>
            <h1 className="font-serif text-h1 font-semi text-ink-1">
              Send recommendation to {rec.borrower.name}
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-1">
              This is the <strong className="font-semi">only</strong>{" "}
              irrevocable action in the option-C surface. Hitting{" "}
              <em>Send to customer</em> dispatches a customer-visible
              communication. Accept / Reject / Snooze / Escalate stay
              reversible on the queue.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge kind="danger">irrevocable</StatusBadge>
            <a
              href={caseHref}
              className="rounded-sm border border-border-strong bg-paper px-3 py-1.5 font-mono text-mono-sm text-ink-1 hover:bg-paper-2"
            >
              ← Back to case
            </a>
          </div>
        </div>
      </header>

      <MetricStrip metrics={metrics} />

      <section className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1fr_22rem]">
        <SendToCustomerClient
          caseId={rec.id}
          recommendation={{
            decision: "SEND",
            riskBand: rec.borrower.risk_band,
            rationaleSummary: rec.rationale,
            approvalAuthority: "Branch Banker (RM)",
            irrevocable: true,
          }}
          returnHref="/"
        />

        <aside className="flex flex-col gap-4">
          <section className="rounded-md border border-rule bg-paper">
            <header className="border-b border-rule px-4 py-3">
              <div className="eyebrow">What this gate does</div>
              <h2 className="font-serif text-h3 font-semi text-ink-1">
                Send-to-customer contract
              </h2>
            </header>
            <ul className="flex flex-col text-ui">
              <li className="border-b border-rule px-4 py-3">
                <span className="font-mono text-mono-sm text-ink-3">
                  customer
                </span>
                <div className="text-ink-1">{rec.borrower.name}</div>
              </li>
              <li className="border-b border-rule px-4 py-3">
                <span className="font-mono text-mono-sm text-ink-3">
                  product
                </span>
                <div className="text-ink-1">
                  Small-business credit card (uplift{" "}
                  {rec.uplift_score} / fit {rec.fit_score})
                </div>
              </li>
              <li className="border-b border-rule px-4 py-3">
                <span className="font-mono text-mono-sm text-ink-3">
                  authority
                </span>
                <div className="text-ink-1">Branch Banker (RM)</div>
              </li>
              <li className="px-4 py-3">
                <span className="font-mono text-mono-sm text-ink-3">
                  canvas
                </span>
                <div className="font-mono text-mono-sm text-ink-2">
                  {CANVAS_SHA256.substring(0, 16)}…
                </div>
              </li>
            </ul>
          </section>
        </aside>
      </section>
    </AppShell>
  );
}
