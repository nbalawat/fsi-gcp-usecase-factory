"use client";

import * as React from "react";
import {
  BreadcrumbNav,
  StatusBadge,
  ApprovalGate,
  type ApprovalRecommendation,
} from "@fsi-bank/components";
import {
  SECTIONS,
  HITL_GATES,
  PRIMARY_BORROWER,
  CASE_SHAPE,
  type GateId,
  type SectionDecision,
  type SectionKind,
} from "../lib/data";

interface FastTrackApprovalProps {
  caseId: string;
}

/**
 * Fast-track approval surface — the inline philosophy applied to the
 * sign-off moment. The page is NOT a separate review queue: it shows
 * the consolidated state of every inline decision already made on the
 * case-detail page, and asks the credit officer to sign off.
 *
 * If the analyst already approved every section inline, this is a
 * one-click confirmation. If anything is outstanding, the officer
 * sees the gaps and can jump back to the exact section to act.
 */
export const FastTrackApproval: React.FC<FastTrackApprovalProps> = ({
  caseId,
}) => {
  // The page-level decision state on the approval page mirrors the
  // analyst's inline decisions. In a real run we'd hydrate this from
  // the audit-writer. For the canvas mock, demonstrate by pre-marking
  // most sections as approved.
  const [decisions, setDecisions] = React.useState<
    Record<SectionKind, SectionDecision>
  >(() =>
    SECTIONS.reduce(
      (acc, s) => {
        acc[s.id] = { kind: s.gate === "final_approval" ? "pending" : "approve" };
        return acc;
      },
      {} as Record<SectionKind, SectionDecision>,
    ),
  );

  const approveAllOutstanding = (): void => {
    setDecisions((d) => {
      const next = { ...d };
      for (const s of SECTIONS) {
        const cur = next[s.id];
        if (!cur || cur.kind === "pending") {
          next[s.id] = { kind: "approve" };
        }
      }
      return next;
    });
  };

  const onFinalAccept = (id: string): void => {
    setDecisions((d) => ({
      ...d,
      final: { kind: "approve", comment: `final approval for ${id}` },
    }));
  };

  const onFinalEdit = (id: string, comment: string): void => {
    setDecisions((d) => ({
      ...d,
      final: { kind: "edit", comment: `${id}: ${comment}` },
    }));
  };

  const onFinalReject = (id: string, comment: string): void => {
    setDecisions((d) => ({
      ...d,
      final: { kind: "reject", comment: `${id}: ${comment}` },
    }));
  };

  const recommendation: ApprovalRecommendation = {
    decision: "APPROVE",
    riskBand: "1-pass",
    rationaleSummary:
      "All inline section decisions are recorded; final approval will dispatch the memo to closing.",
    approvalAuthority: "credit officer",
    irrevocable: true,
  };

  const gateStatuses = HITL_GATES.map((g) => gateStatus(g as GateId, decisions));
  const blockingCount = gateStatuses.filter((s) => s.kind !== "ok").length;
  const finalDecision = decisions["final"]?.kind ?? "pending";

  const caseHref = `/case/${caseId}`;

  return (
    <div className="flex flex-col">
      <BreadcrumbNav
        usecase="credit-memo-commercial-test"
        usecaseLabel="Commercial Credit · Option C"
        stage="approval"
        caseId={caseId}
        borrowerName={PRIMARY_BORROWER?.name ?? ""}
      />

      <header className="border-b border-rule bg-paper px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">approval · {caseId}</div>
            <h1 className="mt-1 font-serif text-h2 font-semi text-ink-1">
              Fast-track sign-off — {CASE_SHAPE.title}
            </h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-2">
              Inline decisions from the analyst review are summarised
              below. Approve the case if everything is green; jump back
              to the section if anything needs attention.
            </p>
          </div>
          <a
            href={caseHref}
            className="rounded border border-rule px-3 py-2 text-mono-sm text-ink-1 hover:bg-paper-2"
          >
            ← Back to inline review
          </a>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: per-gate summary */}
        <div className="flex flex-col gap-4">
          <section
            aria-label="Gate summary"
            className="rounded-lg border border-rule bg-paper p-5"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-h3 font-semi text-ink-1">
                HITL gate summary
              </h2>
              <span className="font-mono text-mono-sm text-ink-3">
                {blockingCount === 0
                  ? "all clear — fast-track available"
                  : `${blockingCount} gate${blockingCount === 1 ? "" : "s"} need action`}
              </span>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {gateStatuses.map((g) => (
                <li
                  key={g.id}
                  className="flex flex-col gap-2 rounded border border-rule bg-paper-2 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-mono-sm text-ink-1">
                        {g.id.replace(/_/g, " ")}
                      </span>
                      <StatusBadge kind={g.tone}>{g.label}</StatusBadge>
                    </div>
                    <span className="font-mono text-mono-sm text-ink-3">
                      {g.approved}/{g.total} sections approved inline
                    </span>
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {g.sectionRows.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center gap-2 rounded border border-rule bg-paper px-2 py-1 text-mono-sm"
                      >
                        <a
                          href={`${caseHref}#section-${row.id}`}
                          className="text-ink-1 hover:underline"
                        >
                          {row.title}
                        </a>
                        <StatusBadge kind={row.tone}>{row.label}</StatusBadge>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          {/* Fast-track quick action — present BUT in service of the
              inline philosophy: it only auto-approves what the analyst
              left pending. Edits / rejects are NEVER auto-overridden. */}
          <section
            aria-label="Fast track"
            className="rounded-lg border border-rule bg-paper p-5"
          >
            <h2 className="font-serif text-h3 font-semi text-ink-1">
              Fast-track unattended sections
            </h2>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-2">
              Only marks <em>pending</em> sections as approved. Edits,
              rejects, and revision requests are preserved as the
              analyst recorded them.
            </p>
            <button
              type="button"
              onClick={approveAllOutstanding}
              className="mt-3 rounded bg-accent px-4 py-2 text-mono-sm font-medium text-paper hover:bg-accent-pressed"
            >
              Approve all pending
            </button>
          </section>
        </div>

        {/* Right: final approval gate (the canonical sign-off surface) */}
        <aside className="flex flex-col gap-4">
          <ApprovalGate
            caseId={caseId}
            recommendation={recommendation}
            onAccept={onFinalAccept}
            onEdit={onFinalEdit}
            onReject={onFinalReject}
            disabled={blockingCount > 0 && finalDecision === "pending"}
          />
          {blockingCount > 0 && finalDecision === "pending" && (
            <div
              role="status"
              className="rounded-md border border-semantic-warning bg-semantic-warningTint px-3 py-2 text-body-sm text-semantic-warning"
            >
              Resolve the {blockingCount} outstanding gate
              {blockingCount === 1 ? "" : "s"} before final approval is
              available. Click any section above to jump back to the
              inline action.
            </div>
          )}
          {finalDecision !== "pending" && (
            <div
              role="status"
              className="rounded-md border border-rule bg-paper-2 px-3 py-2 text-body-sm text-ink-1"
            >
              Final decision recorded: <strong>{finalDecision}</strong>.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

interface GateSummary {
  id: GateId;
  approved: number;
  total: number;
  tone: "success" | "warning" | "danger" | "neutral";
  kind: "ok" | "block";
  label: string;
  sectionRows: {
    id: SectionKind;
    title: string;
    tone: "success" | "warning" | "danger" | "neutral";
    label: string;
  }[];
}

const gateStatus = (
  gate: GateId,
  decisions: Record<SectionKind, SectionDecision>,
): GateSummary => {
  const rows = SECTIONS.filter((s) => s.gate === gate);
  const approved = rows.filter((s) => decisions[s.id]?.kind === "approve").length;
  const hasReject = rows.some((s) => decisions[s.id]?.kind === "reject");
  const hasRev = rows.some((s) => decisions[s.id]?.kind === "request-revision");
  const allOk = approved === rows.length;
  const tone: "success" | "warning" | "danger" | "neutral" = hasReject
    ? "danger"
    : hasRev
      ? "warning"
      : allOk
        ? "success"
        : "neutral";
  const label = hasReject
    ? "blocked"
    : hasRev
      ? "revision pending"
      : allOk
        ? "satisfied"
        : "awaiting";
  return {
    id: gate,
    approved,
    total: rows.length,
    tone,
    kind: allOk ? "ok" : "block",
    label,
    sectionRows: rows.map((s) => {
      const d = decisions[s.id]?.kind ?? "pending";
      const sTone: "success" | "warning" | "danger" | "neutral" =
        d === "approve"
          ? "success"
          : d === "reject"
            ? "danger"
            : d === "request-revision"
              ? "warning"
              : d === "edit"
                ? "neutral"
                : "neutral";
      return {
        id: s.id,
        title: s.title,
        tone: sTone,
        label: d,
      };
    }),
  };
};
