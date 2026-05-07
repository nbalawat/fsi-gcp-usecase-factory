import {
  BreadcrumbNav,
  CaseCard,
  MetricStrip,
  RegulatoryClock,
  WorkflowStageRail,
} from "@fsi-bank/components";
import Link from "next/link";
import {
  DEFAULT_USE_CASE,
  loadConsoleConfig,
} from "../lib/load-console-config";
import { buildSnapshot, loadCases } from "../lib/load-demo-data";
import type { CaseRecord } from "../lib/types";

export const dynamic = "force-dynamic";

const fmtCurrency = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const earliestDeadline = (cases: CaseRecord[]): CaseRecord | null => {
  if (cases.length === 0) return null;
  return cases.reduce((min, c) =>
    new Date(c.regulatory_deadline_ts).getTime() <
    new Date(min.regulatory_deadline_ts).getTime()
      ? c
      : min,
  );
};

export default function HomePage(): JSX.Element {
  const useCase = DEFAULT_USE_CASE;
  const config = loadConsoleConfig(useCase);
  const cases = loadCases(useCase);
  const snapshot = buildSnapshot(config, cases);

  const stuck = cases.filter((c) => c.stuck);
  const inFlight = cases.length;
  const avgDscr =
    cases
      .map((c) => c.dscr_base)
      .filter((d): d is number => d !== undefined)
      .reduce((s, v, _i, arr) => s + v / arr.length, 0) || 0;
  const maxExposure = Math.max(
    ...cases.map((c) => c.single_borrower_pct ?? 0),
    0,
  );
  const earliest = earliestDeadline(cases);
  const hoursRemaining = earliest
    ? Math.max(
        0,
        (new Date(earliest.regulatory_deadline_ts).getTime() - Date.now()) /
          (1000 * 60 * 60),
      )
    : 0;

  return (
    <div className="flex flex-col">
      <BreadcrumbNav
        usecase={useCase}
        usecaseLabel="Credit Memo (Commercial)"
        backHref="/"
        backLabel="Live floor"
      />
      <header className="bg-surface-panel px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              {config.persona}
            </h1>
            <p className="text-sm text-text-secondary">
              {config.in_flight_label ?? "In flight"}: {inFlight} cases ·{" "}
              {stuck.length} stuck &gt; SLA
            </p>
          </div>
        </div>
      </header>

      <MetricStrip
        metrics={[
          {
            id: "in_flight",
            label: "In flight",
            value: inFlight,
            unit: "memos",
          },
          {
            id: "avg_dscr",
            label: "Avg DSCR",
            value: avgDscr.toFixed(2),
            unit: "x",
            state: avgDscr < 1.2 ? "alert" : "ok",
          },
          {
            id: "max_exposure",
            label: "Max exposure",
            value: maxExposure.toFixed(2),
            unit: "%",
            state: maxExposure > 8 ? "alert" : "ok",
          },
          {
            id: "stuck",
            label: "Stuck > SLA",
            value: stuck.length,
            state: stuck.length > 0 ? "alert" : "ok",
          },
          {
            id: "remaining",
            label: "Earliest deadline",
            value: hoursRemaining.toFixed(0),
            unit: "h",
            state:
              hoursRemaining < 8
                ? "alert"
                : hoursRemaining < 24
                  ? "warning"
                  : "ok",
          },
        ]}
      />

      <WorkflowStageRail
        stages={snapshot.stages}
        currentStage="approval"
      />

      <main className="grid gap-4 p-6 lg:grid-cols-[3fr,1fr]">
        <section aria-label="Pipeline canvas" className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Pipeline
          </h2>
          <div className="grid gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-3">
            {snapshot.stages.map((s) => {
              const stageCases = cases.filter((c) => c.stage === s.id);
              if (stageCases.length === 0) return null;
              return (
                <div
                  key={s.id}
                  className="flex min-w-[16rem] flex-col gap-2 rounded-md border border-surface-border bg-surface-panelMuted p-3"
                >
                  <header className="flex items-baseline justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      {s.name}
                    </h3>
                    <span className="text-xs text-text-muted">
                      {stageCases.length}{" "}
                      {stageCases.length === 1 ? "case" : "cases"}
                    </span>
                  </header>
                  <div className="flex flex-col gap-2">
                    {stageCases.map((c) => (
                      <Link
                        key={c.loan_id}
                        href={`/cases/${encodeURIComponent(c.loan_id)}`}
                        className="block"
                      >
                        <CaseCard
                          id={c.loan_id}
                          borrowerId={c.borrower_id}
                          borrowerName={c.borrower_name}
                          stage={c.stage}
                          riskBand={c.risk_band}
                          dscr={c.dscr_base}
                          loanAmountUsd={c.loan_amount_usd}
                          conf={c.agent_confidence}
                          stuck={c.stuck}
                          alert={c.alert}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
            Earliest deadline
          </h2>
          {earliest && (
            <>
              <div className="rounded-md border border-surface-border bg-surface-panel p-3 text-xs">
                <div className="font-semibold text-text-primary">
                  {earliest.borrower_name}
                </div>
                <div className="font-mono text-text-muted">
                  {earliest.loan_id}
                </div>
                <div className="mt-1 text-text-secondary">
                  Loan {fmtCurrency(earliest.loan_amount_usd)}
                </div>
              </div>
              <RegulatoryClock
                regulatoryRegime="OCC 5-business-day"
                startedAt={earliest.clock_started_at}
                deadline={earliest.regulatory_deadline_ts}
              />
            </>
          )}

          {stuck.length > 0 && (
            <>
              <h2 className="mt-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
                Stuck cases
              </h2>
              <ul className="flex flex-col gap-2">
                {stuck.map((c) => (
                  <li
                    key={c.loan_id}
                    className="rounded-md border border-status-critical/40 bg-status-criticalBg p-3 text-xs"
                  >
                    <div className="font-semibold text-text-primary">
                      {c.borrower_name}
                    </div>
                    <div className="font-mono text-text-muted">
                      {c.loan_id}
                    </div>
                    <div className="mt-1 text-status-critical">
                      {c.alert ?? "Past SLA"}
                    </div>
                    <Link
                      href={`/cases/${encodeURIComponent(c.loan_id)}`}
                      className="mt-1 inline-block text-brand-primary hover:underline"
                    >
                      Open case →
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </main>

      <footer className="border-t border-surface-border bg-surface-panel px-6 py-4 text-xs text-text-muted">
        Pipeline console · use case <code>{useCase}</code> · rendered from
        <code> usecases/{useCase}/ui/console.yaml</code>
      </footer>
    </div>
  );
}
