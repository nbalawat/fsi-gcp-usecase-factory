import {
  AgentReasoningPanel,
  ApprovalGate,
  BreadcrumbNav,
  RegulatoryClock,
} from "@fsi-bank/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DEFAULT_USE_CASE,
  loadConsoleConfig,
} from "../../../lib/load-console-config";
import { loadCases } from "../../../lib/load-demo-data";
import { ApprovalActions } from "./approval-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

const fmtCurrency = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default function CaseDetailPage({ params }: PageProps): JSX.Element {
  const useCase = DEFAULT_USE_CASE;
  const config = loadConsoleConfig(useCase);
  const cases = loadCases(useCase);
  const decoded = decodeURIComponent(params.id);
  const c = cases.find((x) => x.loan_id === decoded);
  if (!c) notFound();

  return (
    <div className="flex flex-col">
      <BreadcrumbNav
        usecase={useCase}
        usecaseLabel="Credit Memo (Commercial)"
        stage={c.stage}
        borrowerName={c.borrower_name}
        caseId={c.loan_id}
        backHref="/"
        backLabel="All cases"
      />
      <header className="bg-surface-panel px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">
              {c.borrower_name}{" "}
              <span className="text-sm font-normal text-text-muted">
                · {c.borrower_id}
              </span>
            </h1>
            <p className="text-sm text-text-secondary">
              Loan {fmtCurrency(c.loan_amount_usd)} · risk band {c.risk_band} ·
              recommendation{" "}
              <span className="font-semibold text-text-primary">
                {c.decision}
              </span>
            </p>
          </div>
          <Link
            href="/"
            className="rounded border border-surface-border px-3 py-1 text-xs text-text-secondary hover:border-brand-primary"
          >
            ← Back to pipeline
          </Link>
        </div>
      </header>

      <main className="grid gap-4 p-6 lg:grid-cols-[2fr,1fr]">
        <section aria-label="Memo body" className="flex flex-col gap-4">
          <article className="rounded-md border border-surface-border bg-surface-panel p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Credit memo summary
            </h2>
            <p className="mt-2 text-sm text-text-primary">
              {c.rationale_summary}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-text-muted">DSCR (base)</dt>
                <dd className="font-semibold tabular-nums">
                  {c.dscr_base !== undefined ? `${c.dscr_base.toFixed(2)}x` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">DSCR (stressed)</dt>
                <dd className="font-semibold tabular-nums">
                  {c.dscr_stressed !== undefined
                    ? `${c.dscr_stressed.toFixed(2)}x`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Single-borrower exposure</dt>
                <dd className="font-semibold tabular-nums">
                  {c.single_borrower_pct !== undefined
                    ? `${c.single_borrower_pct.toFixed(2)}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Approval authority</dt>
                <dd className="font-semibold">{c.approval_authority ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-text-muted">NAICS</dt>
                <dd className="font-semibold">{c.naics_code ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Stage</dt>
                <dd className="font-semibold">{c.stage}</dd>
              </div>
            </dl>
            {(c.decline_reasons || c.return_reasons || c.suggested_revisions) && (
              <div className="mt-3 flex flex-col gap-2 text-xs">
                {c.decline_reasons && (
                  <div>
                    <div className="font-semibold text-status-critical">
                      Decline reasons
                    </div>
                    <ul className="ml-4 list-disc text-text-secondary">
                      {c.decline_reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.return_reasons && (
                  <div>
                    <div className="font-semibold text-status-warning">
                      Return reasons
                    </div>
                    <ul className="ml-4 list-disc text-text-secondary">
                      {c.return_reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.suggested_revisions && (
                  <div>
                    <div className="font-semibold text-text-primary">
                      Suggested revisions
                    </div>
                    <ul className="ml-4 list-disc text-text-secondary">
                      {c.suggested_revisions.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </article>

          <AgentReasoningPanel
            step="rater"
            confidence={c.agent_confidence ?? 0.9}
            citationDensity={c.citation_density}
            rationale={c.rationale_summary}
            factors={c.reasoning_factors ?? []}
          />
        </section>

        <aside className="flex flex-col gap-3">
          <RegulatoryClock
            regulatoryRegime="OCC 5-business-day"
            startedAt={c.clock_started_at}
            deadline={c.regulatory_deadline_ts}
          />
          <ApprovalActions
            caseId={c.loan_id}
            disabled={c.stage !== "approval"}
            recommendation={{
              decision: c.decision,
              riskBand: c.risk_band,
              rationaleSummary: c.rationale_summary,
              approvalAuthority: c.approval_authority,
              irrevocable: c.decision === "APPROVE",
            }}
          />
          <details className="rounded-md border border-surface-border bg-surface-panel p-3 text-xs">
            <summary className="cursor-pointer text-text-secondary">
              Console config (debug)
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-text-muted">
              {JSON.stringify(
                {
                  use_case: config.use_case,
                  pattern: config.console_pattern,
                  scenario: c.scenario_id,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </aside>
      </main>
    </div>
  );
}
