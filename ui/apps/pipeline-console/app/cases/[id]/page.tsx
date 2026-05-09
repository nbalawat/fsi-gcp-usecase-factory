import { AppShell } from "@fsi-bank/components";
import { ArrowLeft, Clock, FileText, GitBranch } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Separator } from "../../../components/ui/separator";
import { LiveStatus } from "../../../components/live-status";
import { CaseProcessingPanel } from "@uc/components/case-processing-panel";
import { CaseAutoRefresh } from "@uc/components/case-auto-refresh";
import { PipelineActivity } from "@uc/components/pipeline-activity";
import { ApprovalActions } from "./approval-actions";
import {
  getActiveCases,
  getCase,
  getDocumentsForCase,
  getEventsForCase,
  getMemoArtifact,
  getReturnNoticeArtifact,
  toCaseRecord,
} from "@uc/lib/live-data";
import { CreditMemoDocument } from "@uc/components/credit-memo/credit-memo-document";
import { MemoEmpty } from "@uc/components/credit-memo/memo-empty";
import { DocumentExtractionPanel } from "@uc/components/document-extraction/document-extraction-panel";
import type { DocumentRecord } from "@uc/components/document-extraction/types";
import { ReturnedApplicationPanel } from "@uc/components/returned-application/returned-application-panel";
import { CheckpointActionBar } from "@uc/components/checkpoint-actions/checkpoint-action-bar";
import { MemoExportButtons } from "@uc/components/credit-memo/memo-export-buttons";
import { MemoToc } from "@uc/components/credit-memo/memo-toc";
import { LECO_MEMO_FIXTURE } from "@uc/lib/memo-fixtures";
import { riskBandLabel } from "@uc/lib/risk-band";
import type {
  CreditMemoBody,
  SectionKey,
} from "@uc/components/credit-memo/types";
import { SECTION_ORDER } from "@uc/components/credit-memo/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
  searchParams?: { mock?: string };
}

const fmtUsd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const navItems = (n: number) => [
  { id: "overview", label: "Pipeline overview", icon: "layout-dashboard" as const, href: "/" },
  { id: "queue", label: "Approval queue", icon: "inbox" as const, href: "/", badge: n },
];

const riskTone = (band: string | null | undefined) => {
  const b = String(band ?? "");
  if (b.startsWith("1")) return "success" as const;
  if (b.startsWith("2") || b.startsWith("3")) return "warning" as const;
  if (b.startsWith("4") || b.startsWith("5")) return "danger" as const;
  return "neutral" as const;
};

const decisionTone = (d: string) => {
  if (d === "APPROVE") return "success" as const;
  if (d === "DECLINE") return "danger" as const;
  if (d === "STALLED") return "danger" as const;
  return "warning" as const;
};

const decisionLabel = (d: string) =>
  d === "RETURN_FOR_REVISION"
    ? "Return for revision"
    : d === "APPROVE"
      ? "Approve"
      : d === "DECLINE"
        ? "Decline"
        : "Action required";

export default async function CaseDetailPage({
  params,
  searchParams,
}: PageProps): Promise<JSX.Element> {
  const decoded = decodeURIComponent(params.id);
  const useMock = searchParams?.mock === "1";

  let state: Awaited<ReturnType<typeof getCase>> = null;
  let memo: Awaited<ReturnType<typeof getMemoArtifact>> = null;
  let events: Awaited<ReturnType<typeof getEventsForCase>> = [];
  let documents: Awaited<ReturnType<typeof getDocumentsForCase>> = [];
  let returnNotice: Awaited<ReturnType<typeof getReturnNoticeArtifact>> = null;
  let queueLength = 0;
  try {
    [state, memo, events, documents, returnNotice, queueLength] = await Promise.all([
      getCase(decoded),
      getMemoArtifact(decoded),
      getEventsForCase(decoded),
      getDocumentsForCase(decoded),
      getReturnNoticeArtifact(decoded),
      getActiveCases(100).then((rows) => rows.length),
    ]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[case-detail] live load failed:", (e as Error).message);
  }
  if (!state) notFound();

  const c = toCaseRecord(state, memo);
  const hRemain = Math.max(
    0,
    (new Date(c.regulatory_deadline_ts).getTime() - Date.now()) / (1000 * 60 * 60),
  );
  const clockTone = c.stuck
    ? "danger"
    : hRemain < 8
      ? "danger"
      : hRemain < 24
        ? "warning"
        : "success";

  const memoToRender: CreditMemoBody | null = useMock
    ? LECO_MEMO_FIXTURE
    : memo && Object.keys(memo).length > 0
      ? (memo as CreditMemoBody)
      : null;

  // Audit summary stats — small chip in the action rail
  const agentCount = events.filter((e) => e.event_type === "agent_action").length;
  const ruleCount = events.filter((e) => e.event_type === "rule_evaluated").length;
  const serviceCount = events.filter((e) => e.event_type === "service_invoked").length;
  const totalCost = events.reduce(
    (s, e) => s + (typeof e.cost_usd === "number" ? e.cost_usd : 0),
    0,
  );

  return (
    <AppShell
      brand="Commercial Credit"
      context="dev · us-central1"
      nav={navItems(queueLength)}
      active="queue"
    >
      {/* ── Slim sticky top bar — identity + nav only. Decision badges live in the right rail. ── */}
      <div
        className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-rule bg-paper/95 px-6 backdrop-blur"
        style={{ position: "sticky", top: 0 }}
      >
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Queue
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <h1 className="min-w-0 truncate font-serif text-h4 font-semi tracking-tight text-ink-1">
          {c.borrower_name}
        </h1>
        <span className="hidden whitespace-nowrap font-mono text-mono-sm text-ink-3 md:inline">
          {c.naics_code ? `NAICS ${c.naics_code}` : ""}
          {c.naics_code ? " · " : ""}
          {fmtUsd(c.loan_amount_usd)}
        </span>
        <Separator orientation="vertical" className="hidden h-5 md:block" />
        <span
          className="hidden whitespace-nowrap font-mono text-mono-sm text-ink-3 md:inline"
          title={
            state?.created_at
              ? `Submitted ${new Date(state.created_at).toLocaleString()}`
              : ""
          }
        >
          {state?.created_at ? (
            <>
              Submitted{" "}
              {new Date(state.created_at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </>
          ) : null}
        </span>
        {state?.updated_at && state.current_stage === "done" && (
          <span
            className="hidden whitespace-nowrap font-mono text-mono-sm text-semantic-success md:inline"
            title={`Completed ${new Date(state.updated_at).toLocaleString()}`}
          >
            · Completed in{" "}
            {(() => {
              const sec = Math.max(
                1,
                Math.round(
                  (new Date(state.updated_at).getTime() -
                    new Date(state.created_at).getTime()) /
                    1000,
                ),
              );
              if (sec < 60) return `${sec}s`;
              const min = Math.round(sec / 60);
              return `${min}m`;
            })()}
          </span>
        )}
        <div className="flex-1" />
        <MemoExportButtons
          applicationId={c.application_id}
          memo={memoToRender}
          mock={useMock}
          compact
        />
      </div>

      {/* ── Processing banner (only renders for in-flight cases) ── */}
      <CaseAutoRefresh
        applicationId={c.application_id}
        initialStage={c.stage}
      />

      <CaseProcessingPanel
        applicationId={c.application_id}
        initialStage={c.stage}
      />

      {/* ── Document layout: TOC | memo | action rail ── */}
      <div className="grid gap-0 items-start lg:grid-cols-[220px_1fr_300px]">
        {/* Left rail: sticky TOC. Scrolls with the page; pinned beneath the
         * 48px topbar; scroll inside the aside if the TOC overflows. */}
        <aside
          className="hidden lg:block border-r border-rule bg-paper px-5 py-8 self-start"
          style={{
            position: "sticky",
            top: 48,
            maxHeight: "calc(100vh - 48px)",
            overflowY: "auto",
          }}
        >
          {memoToRender && (
            <MemoToc
              status={Object.fromEntries(
                SECTION_ORDER.map((k) => [
                  k,
                  (memoToRender as Record<string, unknown>)[k]
                    ? "complete"
                    : "pending",
                ]),
              ) as Record<SectionKey, "complete" | "drafting" | "pending">}
              hasAppendices={Boolean(
                memoToRender.appendices &&
                  Object.keys(memoToRender.appendices).length > 0,
              )}
            />
          )}
        </aside>

        <main className="min-w-0 px-8 py-10 lg:px-12 lg:py-12 space-y-8">
          {/* HITL action bar — sticky at top when the workflow is paused
              waiting for a human decision. */}
          <CheckpointActionBar
            applicationId={c.application_id}
            currentStage={c.current_stage}
            riskBand={c.risk_band}
          />

          {/* Returned-application banner — replaces memo when validation gate
              routed this app back to the applicant. */}
          {returnNotice && c.decision === "RETURN_FOR_REVISION" ? (
            <ReturnedApplicationPanel
              notice={returnNotice as never}
              borrower_name={c.borrower_name}
              loan_amount_usd={c.loan_amount_usd}
            />
          ) : null}

          {/* Per-document panel — shows what was extracted from each PDF. */}
          {documents.length > 0 ? (
            <DocumentExtractionPanel
              documents={documents as unknown as DocumentRecord[]}
            />
          ) : null}

          {/* Memo first when not returned — it's the artifact the user came for. */}
          {!returnNotice || c.decision !== "RETURN_FOR_REVISION" ? (
            memoToRender ? (
              <CreditMemoDocument
                applicationId={c.application_id}
                memo={memoToRender as Partial<CreditMemoBody>}
                hideToc
              />
            ) : (
              <MemoEmpty />
            )
          ) : null}

          {/* Pipeline activity below the memo — secondary content, the
           * "how this was built" trail, not the headline artifact. */}
          <details className="mt-16 group" open>
            <summary className="cursor-pointer list-none flex items-baseline justify-between gap-3 border-t border-rule pt-6 pb-2 select-none">
              <h3 className="font-serif text-h3 font-semi tracking-tight text-ink-1">
                How this memo was built
              </h3>
              <span className="font-mono text-mono-sm text-ink-3">
                {events.length} events · click to collapse
              </span>
            </summary>
            <div className="mt-4">
              <PipelineActivity events={events} />
            </div>
          </details>
        </main>

        {/* ── Right rail: action panel + supporting facts. Sticky. ── */}
        <aside
          className="border-l border-rule bg-paper-2/50 p-6 lg:sticky"
          style={{ position: "sticky", top: 56, alignSelf: "start", maxHeight: "calc(100vh - 56px)", overflowY: "auto" }}
        >
          {/* At-a-glance chips: risk · recommendation · clock */}
          <div className="mb-5 flex flex-wrap gap-1.5">
            {(() => {
              const r = riskBandLabel(c.risk_band);
              return (
                <Badge tone={r.tone} dot>
                  <span className="whitespace-nowrap">
                    {r.label}
                    {r.code !== "—" && (
                      <span className="ml-1 font-mono text-mono-sm opacity-70">
                        · {r.code}
                      </span>
                    )}
                  </span>
                </Badge>
              );
            })()}
            <Badge tone={decisionTone(c.decision)} dot>
              <span className="whitespace-nowrap">{decisionLabel(c.decision)}</span>
            </Badge>
            <Badge tone={clockTone} dot>
              <Clock className="h-3 w-3" />
              <span className="whitespace-nowrap">
                {hRemain < 1
                  ? "<1h"
                  : hRemain < 24
                    ? `${hRemain.toFixed(0)}h`
                    : `${(hRemain / 24).toFixed(1)}d`}
              </span>
            </Badge>
          </div>

          {/* Decision */}
          <section>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
              Your decision
            </p>
            <p className="mt-1 text-body-sm text-ink-2">
              {c.stage === "approval"
                ? "Awaiting your action."
                : c.stage === "posting"
                  ? "Approved — posting in flight."
                  : c.stage === "done"
                    ? "Closed."
                    : "Not yet ready for decision."}
            </p>
            <div className="mt-4">
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
            </div>
          </section>

          <Separator className="my-6" />

          {/* Regulatory clock — compact */}
          <section>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
              OCC clock
            </p>
            <p className="mt-1 font-serif text-display-3 font-semi tabular-nums tracking-tight text-ink-1">
              {hRemain < 1
                ? "<1h"
                : hRemain < 24
                  ? `${hRemain.toFixed(0)}h`
                  : `${(hRemain / 24).toFixed(1)}d`}
            </p>
            <p className="mt-1 text-body-sm text-ink-3">
              5-business-day decision deadline · 12 CFR 32
            </p>
            <p className="mt-2 font-mono text-mono-sm text-ink-3">
              Due{" "}
              {new Date(c.regulatory_deadline_ts).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </section>

          <Separator className="my-6" />

          {/* Pipeline summary — what the AI did */}
          <section>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
              How this memo was built
            </p>
            <ul className="mt-2 flex flex-col gap-2 text-body-sm text-ink-2">
              <li className="flex items-baseline justify-between gap-2">
                <span>Specialist agents</span>
                <span className="font-mono tabular-nums text-ink-1">
                  {agentCount}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-2">
                <span>Rules evaluated</span>
                <span className="font-mono tabular-nums text-ink-1">
                  {ruleCount}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-2">
                <span>Atomic services called</span>
                <span className="font-mono tabular-nums text-ink-1">
                  {serviceCount}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-2">
                <span>Spend</span>
                <span className="font-mono tabular-nums text-ink-1">
                  ${totalCost.toFixed(2)}
                </span>
              </li>
            </ul>
            <Button variant="ghost" size="sm" className="mt-3 w-full" asChild>
              <Link href={`/cases/${encodeURIComponent(c.application_id)}/audit`}>
                <GitBranch className="h-3.5 w-3.5" />
                View full audit trail
              </Link>
            </Button>
          </section>

          <Separator className="my-6" />

          {/* Source documents */}
          <section>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
              Source documents
            </p>
            <ul className="mt-2 flex flex-col gap-1.5 text-body-sm text-ink-2">
              <li className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-ink-3" />
                <span className="truncate">{c.borrower_name} 10-K</span>
              </li>
              <li className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-ink-3" />
                <span className="truncate">Latest 10-Q</span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
