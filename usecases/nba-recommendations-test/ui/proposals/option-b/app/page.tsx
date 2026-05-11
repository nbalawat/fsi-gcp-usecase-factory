import * as React from "react";
import { AppShell, MetricStrip, type NavItem } from "../components/primitives";
import { NarrativeCard } from "../components/NarrativeCard";
import { RightRail } from "../components/RightRail";
import {
  RECOMMENDATIONS,
  getCustomer,
  dispositionMetrics,
} from "../lib/data";

const NAV: NavItem[] = [
  { id: "queue",     label: "Recommendations", href: "/",        icon: "inbox",    badge: RECOMMENDATIONS.length },
  { id: "customers", label: "Customer 360",    href: "/customers", icon: "users" },
  { id: "activity",  label: "Live activity",   href: "/activity",  icon: "activity" },
  { id: "patterns",  label: "Accept patterns", href: "/patterns",  icon: "bar-chart" },
  { id: "agent",     label: "Agent traces",    href: "/agent",     icon: "bot" },
];

export default function HomePage(): React.ReactElement {
  // Top-of-queue (urgent + attention) read as full narrative cards;
  // routine items render compact (one-line story, no timeline). This is
  // the recommendations console's queue affordance.
  const urgentAndAttention = RECOMMENDATIONS.filter(
    (r) => r.urgency !== "routine",
  );
  const routine = RECOMMENDATIONS.filter((r) => r.urgency === "routine");

  return (
    <AppShell brand="NBA · Customer 360" subtitle="Recommendations queue" nav={NAV} active="queue">
      <MetricStrip metrics={dispositionMetrics()} />

      <div className="flex min-h-0 flex-col lg:flex-row">
        <section
          aria-label="Recommendations queue"
          className="flex-1 px-6 py-6"
        >
          <header className="mb-4 flex items-baseline gap-3">
            <div>
              <div className="eyebrow">For Priya Subramanian · RM</div>
              <h1 className="font-serif text-h1 font-semi text-ink-1">
                {RECOMMENDATIONS.length} customer stories awaiting your review
              </h1>
              <p className="mt-1 text-ui text-ink-3">
                The agent reads each relationship and drafts a story. You read the story, ask one question, and act.
              </p>
            </div>
          </header>

          <ol className="flex flex-col gap-5">
            {urgentAndAttention.map((rec) => {
              const customer = getCustomer(rec.customerId);
              if (!customer) return null;
              return (
                <li key={rec.id}>
                  <NarrativeCard
                    rec={rec}
                    customer={customer}
                    caseHref={`/case/${rec.id}`}
                  />
                </li>
              );
            })}

            {routine.length > 0 && (
              <li>
                <div className="eyebrow my-2">Routine · check-in candidates</div>
                <ol className="flex flex-col gap-3">
                  {routine.map((rec) => {
                    const customer = getCustomer(rec.customerId);
                    if (!customer) return null;
                    return (
                      <li key={rec.id}>
                        <NarrativeCard
                          rec={rec}
                          customer={customer}
                          compact
                          caseHref={`/case/${rec.id}`}
                        />
                      </li>
                    );
                  })}
                </ol>
              </li>
            )}
          </ol>
        </section>

        <RightRail />
      </div>
    </AppShell>
  );
}
