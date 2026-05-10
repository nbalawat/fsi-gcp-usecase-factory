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
import { RulesTable } from "@uc/components/rules/rules-table";
import { ApprovalActions } from "./approval-actions";
import {
  getActiveCases,
  getCase,
  getDocumentsForCase,
  getEventsForCase,
  getMemoArtifact,
  getPendingCallbacks,
  getReturnNoticeArtifact,
  getSpreadingViewModelForCase,
  toCaseRecord,
} from "@uc/lib/live-data";
import { CreditMemoDocument } from "@uc/components/credit-memo/credit-memo-document";
import { MemoWithEdit } from "@uc/components/credit-memo/memo-with-edit";
import { MemoEmpty } from "@uc/components/credit-memo/memo-empty";
import { DocumentExtractionPanel } from "@uc/components/document-extraction/document-extraction-panel";
import type { DocumentRecord } from "@uc/components/document-extraction/types";
import { ReturnedApplicationPanel } from "@uc/components/returned-application/returned-application-panel";
import { CheckpointActionBar } from "@uc/components/checkpoint-actions/checkpoint-action-bar";
import { SpreadingWorkbench } from "@uc/components/spreading/spreading-workbench";
import type { SpreadingViewModel } from "@uc/components/spreading/types";
import { CaseTabbedShell } from "@uc/components/case-shell/case-tabbed-shell";
import { autoGroundMemo } from "@uc/lib/auto-ground-memo";
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
  let spreading: Awaited<ReturnType<typeof getSpreadingViewModelForCase>> = null;
  let queueLength = 0;
  let pendingCheckpoints: string[] = [];
  try {
    [state, memo, events, documents, returnNotice, spreading, queueLength, pendingCheckpoints] = await Promise.all([
      getCase(decoded),
      getMemoArtifact(decoded),
      getEventsForCase(decoded),
      getDocumentsForCase(decoded),
      getReturnNoticeArtifact(decoded),
      getSpreadingViewModelForCase(decoded),
      getActiveCases(100).then((rows) => rows.length),
      getPendingCallbacks(decoded),
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

  const memoFromDb: CreditMemoBody | null = useMock
    ? LECO_MEMO_FIXTURE
    : memo && Object.keys(memo).length > 0
      ? (memo as unknown as CreditMemoBody)
      : null;
  // Auto-ground every section against the extracted document citations.
  // The drafter agent emits empty citations[] arrays per section; this
  // post-process attaches the most relevant chunks (matched by topic
  // map) to any section the drafter left empty. Server-side, deterministic,
  // zero LLM cost. Sections that already have agent-emitted citations
  // are left untouched.
  const memoToRender: CreditMemoBody | null = memoFromDb
    ? (autoGroundMemo(
        memoFromDb as Partial<CreditMemoBody>,
        documents as unknown as Parameters<typeof autoGroundMemo>[1],
      ) as CreditMemoBody)
    : null;

  // Audit summary stats — small chip in the action rail
  const agentCount = events.filter((e) => e.event_type === "agent_action").length;
  const ruleCount = events.filter((e) => e.event_type === "rule_evaluated").length;
  const serviceCount = events.filter((e) => e.event_type === "service_invoked").length;

  // Project rule_evaluated events into the shape the RulesTable wants —
  // unwrap the payload (which is what the rules-service writes) into
  // top-level fields the table reads. Order by occurred_at so reruns
  // appear in chronological order.
  const ruleEvents = events
    .filter((e) => e.event_type === "rule_evaluated")
    .map((e) => {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      return {
        rule_set: String(p.rule_set ?? ""),
        decision: String(p.decision ?? ""),
        reason: typeof p.reason === "string" ? p.reason : null,
        inputs:
          p.inputs && typeof p.inputs === "object"
            ? (p.inputs as Record<string, unknown>)
            : null,
        outputs:
          p.outputs && typeof p.outputs === "object"
            ? (p.outputs as Record<string, unknown>)
            : null,
        skipped: Boolean(p.skipped),
        latency_ms: typeof e.latency_ms === "number" ? e.latency_ms : null,
        occurred_at: e.occurred_at,
      };
    });
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

      {/* ── Tabbed three-pane layout. Center area holds ONE tab at a time;
              left rail is the tab nav; right rail is the decision/clock/actions.
              The HITL action bar is rendered separately, sticky at the bottom
              of the viewport, so the next required action is always visible
              regardless of which tab is active. ── */}
      {returnNotice && c.decision === "RETURN_FOR_REVISION" ? (
        <div className="mx-auto w-full max-w-[1640px] px-4 pb-32 pt-4 lg:px-8">
          <ReturnedApplicationPanel
            notice={returnNotice as never}
            borrower_name={c.borrower_name}
            loan_amount_usd={c.loan_amount_usd}
          />
        </div>
      ) : (
        <CaseTabbedShell
          applicationId={c.application_id}
          defaultTabId={
            // Data-aware default: show the "Credit memo" tab when a
            // memo actually exists; otherwise show "How it was built"
            // (pipeline activity) so the banker sees live progress
            // while the workflow is mid-run, not an empty memo state.
            // The shell still respects the user's last-selected tab
            // via sessionStorage (keyed per-application) — so manually
            // navigating to a tab persists across router.refresh()
            // for THIS case, but each new case starts on its
            // data-aware default.
            memoToRender ? "memo" : "build"
          }
          header={null}
          tabs={[
            {
              id: "memo",
              label: "Credit memo",
              hint: memoToRender ? "10 sections" : "drafting…",
              count: null,
              content: memoToRender ? (
                <div className="rounded-lg border border-rule bg-paper p-6 lg:p-8">
                  <MemoWithEdit
                    applicationId={c.application_id}
                    memo={memoToRender as Partial<CreditMemoBody>}
                    available_documents={documents.map((d) => ({
                      doc_id: d.doc_id,
                      doc_type: d.doc_type,
                      original_filename: d.original_filename,
                      page_count: d.page_count,
                    }))}
                    suggested_chunks={documents.flatMap((d) =>
                      (d.citations as Array<{
                        field_path?: string;
                        page?: number;
                        excerpt?: string | null;
                      }>)
                        .filter(
                          (c) =>
                            typeof c.page === "number" &&
                            typeof c.excerpt === "string" &&
                            c.excerpt.trim().length > 10,
                        )
                        .map((c) => ({
                          doc_id: d.doc_id,
                          doc_type: d.doc_type,
                          doc_filename: d.original_filename,
                          field_path: c.field_path ?? "",
                          page: c.page as number,
                          excerpt: (c.excerpt as string).trim(),
                        })),
                    )}
                    hideToc
                  />
                </div>
              ) : (
                <MemoEmpty
                  currentStage={c.stage}
                  stageEnteredAt={c.stage_entered_at}
                />
              ),
            },
            {
              id: "spreading",
              label: "Spreading",
              hint: "Adjust + recompute",
              count: null,
              content: (
                <div className="rounded-lg border border-rule bg-paper p-4 lg:p-6">
                  <SpreadingWorkbench
                    data={spreading as SpreadingViewModel | null}
                    read_only={c.stage === "done"}
                  />
                </div>
              ),
            },
            {
              id: "documents",
              label: "Documents",
              hint: "Per-doc extraction",
              count: documents.length || null,
              content:
                documents.length > 0 ? (
                  <div className="rounded-lg border border-rule bg-paper p-4 lg:p-6">
                    <DocumentExtractionPanel
                      documents={documents as unknown as DocumentRecord[]}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-rule p-8 text-center text-body-sm text-ink-3">
                    No documents uploaded yet for this application.
                  </div>
                ),
            },
            {
              id: "rules",
              label: "Rules",
              hint: "Regulatory + policy",
              count: ruleEvents.length || null,
              content: (
                <div className="rounded-lg border border-rule bg-paper p-4 lg:p-6">
                  <RulesTable events={ruleEvents as never} />
                </div>
              ),
            },
            {
              id: "build",
              label: "How it was built",
              hint: "Pipeline activity",
              count: events.length,
              content: (
                <div className="rounded-lg border border-rule bg-paper p-4 lg:p-6">
                  <PipelineActivity events={events} />
                </div>
              ),
            },
          ]}
          leftSummary={
            memoToRender ? (
              <div>
                <p className="mb-2 text-mono-sm font-mono uppercase tracking-[0.04em] text-ink-3">
                  Memo sections
                </p>
                <MemoToc
                  status={Object.fromEntries(
                    SECTION_ORDER.map((k) => [
                      k,
                      (memoToRender as unknown as Record<string, unknown>)[k]
                        ? "complete"
                        : "pending",
                    ]),
                  ) as Record<SectionKey, "complete" | "drafting" | "pending">}
                  hasAppendices={Boolean(
                    memoToRender.appendices &&
                      Object.keys(memoToRender.appendices).length > 0,
                  )}
                />
              </div>
            ) : null
          }
          rightRail={
            <div
              className="rounded-md border border-rule bg-paper-2/50 p-5"
              style={{ maxHeight: "calc(100vh - 5rem)", overflowY: "auto" }}
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
            {/* Decision badge — only show when the workflow has actually
                finalized (stage=done). On in-flight cases the decision
                column may carry a stale stamp from a legacy subscriber
                (now detached) but we should never imply "Approved" while
                the workflow is still running. */}
            {c.stage === "done" && c.decision ? (
              <Badge tone={decisionTone(c.decision)} dot>
                <span className="whitespace-nowrap">{decisionLabel(c.decision)}</span>
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                <span className="whitespace-nowrap">In progress · {c.stage}</span>
              </Badge>
            )}
            {/* OCC clock chip — countdown is only meaningful while the
                case is open. On done cases, replace with a "closed in N"
                stat so the chip strip is internally consistent. */}
            {c.stage === "done" ? (
              (() => {
                const closedInMs =
                  state?.updated_at && state?.created_at
                    ? new Date(state.updated_at).getTime() -
                      new Date(state.created_at).getTime()
                    : 0;
                const min = Math.max(1, Math.round(closedInMs / 60000));
                const label = min < 60 ? `${min}m` : `${(min / 60).toFixed(1)}h`;
                return (
                  <Badge tone="success" dot>
                    <Clock className="h-3 w-3" />
                    <span className="whitespace-nowrap">closed in {label}</span>
                  </Badge>
                );
              })()
            ) : (
              <Badge tone={clockTone} dot>
                <Clock className="h-3 w-3" />
                <span className="whitespace-nowrap">
                  {hRemain < 1
                    ? "<1h"
                    : hRemain < 24
                      ? `${hRemain.toFixed(0)}h left`
                      : `${(hRemain / 24).toFixed(1)}d left`}
                </span>
              </Badge>
            )}
          </div>

          {/* Decision summary (read-only).
              Actions on a paused workflow are taken via the sticky
              CheckpointActionBar at the bottom of the viewport — this
              right-rail panel just SUMMARIZES the current state. The
              legacy ApprovalActions form was retired when Cloud
              Workflows v3 took over the HITL flow. */}
          <section>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
              Decision
            </p>
            <p className="mt-1 text-body-sm text-ink-2">
              {/* Decision summary is GATED on stage===done. While the
                  workflow is mid-run, decision is either null or a stale
                  pre-finalize value — neither is meaningful to surface
                  as the case's decision. Show the running state instead. */}
              {c.stage === "done" && c.decision === "APPROVE" ? (
                <>
                  <strong className="text-semantic-success">Approved.</strong>{" "}
                  Case closed; memo signed off and persisted.
                </>
              ) : c.stage === "done" && c.decision === "DECLINE" ? (
                <>
                  <strong className="text-semantic-danger">Declined.</strong>{" "}
                  Case closed.
                </>
              ) : c.stage === "done" && c.decision === "RETURN_FOR_REVISION" ? (
                <>
                  <strong className="text-semantic-warning">Returned.</strong>{" "}
                  Sent back to applicant — see the missing-items panel.
                </>
              ) : c.stage === "done" ? (
                <>Case closed (decision pending state-write).</>
              ) : pendingCheckpoints.length > 0 ? (
                <>
                  <strong>Action pending.</strong> See the action bar at
                  the bottom of the page.
                </>
              ) : c.stage === "posting" ? (
                <>Posting downstream — final state writing.</>
              ) : (
                <>
                  <strong>In progress.</strong> Workflow at stage{" "}
                  <code className="font-mono text-mono-sm text-ink-1">
                    {c.stage}
                  </code>
                  . Decision will appear when the workflow finalizes.
                </>
              )}
            </p>
          </section>

          <Separator className="my-6" />

          {/* Regulatory clock — only meaningful while the case is open.
              On closed cases, replace with a turnaround stat so the rail
              never says "5 days remaining" on a case that's already closed. */}
          {c.stage === "done" ? (
            <section>
              <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
                Turnaround
              </p>
              {(() => {
                if (!state?.created_at || !state?.updated_at) {
                  return (
                    <p className="mt-1 text-body-sm text-ink-3">
                      Closed; turnaround unknown.
                    </p>
                  );
                }
                const ms =
                  new Date(state.updated_at).getTime() -
                  new Date(state.created_at).getTime();
                const min = Math.max(1, Math.round(ms / 60000));
                const big =
                  min < 60
                    ? `${min}m`
                    : min < 60 * 24
                      ? `${(min / 60).toFixed(1)}h`
                      : `${(min / 60 / 24).toFixed(1)}d`;
                return (
                  <>
                    <p className="mt-1 font-serif text-display-3 font-semi tabular-nums tracking-tight text-ink-1">
                      {big}
                    </p>
                    <p className="mt-1 text-body-sm text-ink-3">
                      Time from submission to final decision · vs. 5-day OCC ceiling
                    </p>
                    <p className="mt-2 font-mono text-mono-sm text-ink-3">
                      Closed{" "}
                      {new Date(state.updated_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </>
                );
              })()}
            </section>
          ) : (
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
          )}

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

          {/* Source documents — read from the actual application_documents
              rows for this case, not a hardcoded placeholder. Each row
              shows doc_type label + filename + extraction status pip so
              the banker sees at a glance which docs are extracted vs
              still processing vs failed. */}
          <section>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
              Source documents ({documents.length})
            </p>
            {documents.length === 0 ? (
              <p className="mt-2 text-body-sm text-ink-3">
                No documents uploaded for this application.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5 text-body-sm text-ink-2">
                {documents.map((d) => {
                  const status = d.extraction_status;
                  const dot =
                    status === "extracted"
                      ? "bg-semantic-success"
                      : status === "failed"
                        ? "bg-semantic-danger"
                        : "bg-ink-3";
                  return (
                    <li key={d.doc_id} className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-1">
                          {d.original_filename}
                        </span>
                        <span className="block font-mono text-mono-sm text-ink-3">
                          <span
                            className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${dot}`}
                            aria-hidden
                          />
                          {d.doc_type}
                          {typeof d.page_count === "number" && d.page_count > 0
                            ? ` · ${d.page_count} pp`
                            : ""}
                          {status === "extracted"
                            ? ""
                            : ` · ${status}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
            </div>
          }
        />
      )}

      {/* HITL action bar — sticky at the bottom of the viewport so the
          banker always sees the next required action regardless of
          which tab they're on. CheckpointActionBar self-hides when no
          callback is pending. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div className="pointer-events-auto mx-auto max-w-[1640px] px-4 pb-3 lg:px-8">
          <CheckpointActionBar
            applicationId={c.application_id}
            currentStage={c.stage}
            riskBand={c.risk_band}
            pendingCheckpoints={pendingCheckpoints}
          />
        </div>
      </div>
    </AppShell>
  );
}
