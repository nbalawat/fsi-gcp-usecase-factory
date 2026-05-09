"use client";

/**
 * The credit-memo document.
 *
 * Layout: a 200px sticky TOC on the left + a 760-max reading column. As each
 * section's data arrives in the `memo` prop, the placeholder skeleton fades
 * out and the real content fades in. The TOC's status dots flip as sections
 * arrive. Citations are typeset with superscript indices that pop up source
 * details on click.
 *
 * Validation: if the memo has obvious issues (review_status === 'revise',
 * citation_density < 0.80), a warning banner is shown above the body.
 */

import * as React from "react";
import { cn } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { MemoToc, type SectionStatus } from "./memo-toc";
import { MemoSectionSkeleton } from "./memo-skeleton";
import { MemoStreamingStatus } from "./memo-streaming-status";
import {
  SECTION_ORDER,
  SECTION_LABELS,
  type CreditMemoBody,
  type SectionKey,
} from "./types";
import { ExecSummarySection } from "./sections/exec-summary";
import { BorrowerOverviewSection } from "./sections/borrower-overview";
import { FinancialAnalysisSection } from "./sections/financial-analysis";
import { CashFlowProjectionSection } from "./sections/cash-flow-projection";
import { RiskFactorsSection } from "./sections/risk-factors";
import { CollateralSection } from "./sections/collateral";
import { CovenantPackageSection } from "./sections/covenant-package";
import { RegulatoryConcentrationSection } from "./sections/regulatory-concentration";
import { RiskRatingRationaleSection } from "./sections/risk-rating-rationale";
import { RecommendationSection } from "./sections/recommendation";
import { fmtDate } from "./format";

interface Props {
  applicationId: string;
  /** Partial memo body — sections not yet present render as skeletons. */
  memo: Partial<CreditMemoBody> | null;
  /** Whether to suppress the sticky TOC (e.g. in the print view). */
  hideToc?: boolean;
  /** Whether to render in compact mode (no extra padding) — print view. */
  compact?: boolean;
  /** Optional ribbon above the body (e.g. validation warning). */
  banner?: React.ReactNode;
}

const sectionStatus = (
  memo: Partial<CreditMemoBody> | null,
): Record<SectionKey, SectionStatus> => {
  const out = {} as Record<SectionKey, SectionStatus>;
  SECTION_ORDER.forEach((k) => {
    if (memo && (memo as Record<string, unknown>)[k]) out[k] = "complete";
    else out[k] = "pending";
  });
  // The first pending section (after the last complete one) becomes "drafting".
  let lastComplete = -1;
  SECTION_ORDER.forEach((k, i) => {
    if (out[k] === "complete") lastComplete = i;
  });
  const firstPendingIdx = SECTION_ORDER.findIndex((k) => out[k] === "pending");
  const firstPendingKey =
    firstPendingIdx >= 0 ? SECTION_ORDER[firstPendingIdx] : undefined;
  if (firstPendingKey && lastComplete >= 0) {
    out[firstPendingKey] = "drafting";
  } else if (firstPendingIdx === 0 && memo && firstPendingKey) {
    out[firstPendingKey] = "drafting";
  }
  return out;
};

export const CreditMemoDocument: React.FC<Props> = ({
  applicationId,
  memo,
  hideToc = false,
  compact = false,
  banner,
}) => {
  const status = React.useMemo(() => sectionStatus(memo), [memo]);
  const draftingKey = SECTION_ORDER.find((k) => status[k] === "drafting") ?? null;
  const draftingIndex = draftingKey
    ? SECTION_ORDER.indexOf(draftingKey) + 1
    : null;

  // Once the drafter has finished (memo.drafted_at is set), any section
  // still missing or empty is FINAL-EMPTY, not still-drafting. Render a
  // clean "section unavailable" tile instead of an indefinite skeleton —
  // otherwise the user sees skeletons spinning forever (the credit-memo
  // glitch we paid for).
  const drafterDone = !!memo?.drafted_at;

  const isEmptyContent = (v: unknown): boolean => {
    if (v == null) return true;
    if (typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      // empty {} OR object with all-empty values (citations:[] only, etc.)
      const meaningful = Object.entries(obj).filter(([k, val]) => {
        if (k === "citations") return false;  // citations alone don't count
        if (val == null) return false;
        if (Array.isArray(val) && val.length === 0) return false;
        if (typeof val === "string" && val.trim() === "") return false;
        if (typeof val === "object" && Object.keys(val).length === 0) return false;
        return true;
      });
      return meaningful.length === 0;
    }
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  };

  // Wrap each section in a transition container so the swap from skeleton →
  // real content is a soft fade (200 ms) rather than a snap.
  const renderSection = (key: SectionKey, idx: number): React.ReactNode => {
    const content = (memo as Record<string, unknown> | null)?.[key];
    const empty = isEmptyContent(content);

    if (empty && drafterDone) {
      return (
        <FadeIn key={`${key}-na`} keyId={`${key}-na`}>
          <SectionUnavailable number={idx + 1} title={SECTION_LABELS[key]} />
        </FadeIn>
      );
    }
    if (empty) {
      return (
        <FadeIn key={`${key}-skel`} keyId={`${key}-skel`}>
          <MemoSectionSkeleton number={idx + 1} title={SECTION_LABELS[key]} />
        </FadeIn>
      );
    }
    return (
      <FadeIn key={`${key}-real`} keyId={`${key}-real`}>
        <SectionErrorBoundary label={SECTION_LABELS[key]}>
          {sectionElement(key, content)}
        </SectionErrorBoundary>
      </FadeIn>
    );
  };

  const validationWarning = memoValidationIssues(memo);

  return (
    <div
      className={cn(
        "relative",
        compact ? "" : "px-2 md:px-0",
      )}
      data-application-id={applicationId}
    >
      {/* Header strip with metadata */}
      {memo && !compact && (
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-4">
          <div>
            <p className="text-eyebrow uppercase tracking-[0.08em] text-accent-pressed font-mono">
              Confidential — Commercial Credit Memo
            </p>
            <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
              {memo.executive_summary?.borrower_name ?? "Credit Memo"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {memo.review_status && (
              <Badge
                tone={
                  memo.review_status === "approved"
                    ? "success"
                    : memo.review_status === "revise"
                      ? "warning"
                      : "neutral"
                }
                dot
              >
                {memo.review_status === "approved"
                  ? "Reviewed & Approved"
                  : memo.review_status === "revise"
                    ? "Revisions Requested"
                    : memo.review_status === "reviewed"
                      ? "Reviewed"
                      : "Draft"}
              </Badge>
            )}
            {memo.revision_number != null && (
              <span className="font-mono text-mono-sm text-ink-3">
                Rev {memo.revision_number}
              </span>
            )}
            {memo.drafted_at && (
              <span className="font-mono text-mono-sm text-ink-3">
                Drafted {fmtDate(memo.drafted_at)}
              </span>
            )}
            {memo.citation_density != null && (
              <Badge
                tone={memo.citation_density >= 0.8 ? "success" : "warning"}
                dot
              >
                Citation density {(memo.citation_density * 100).toFixed(0)}%
              </Badge>
            )}
          </div>
        </div>
      )}

      {banner}

      {validationWarning && !compact && (
        <div className="mb-6 rounded-md border border-semantic-warning/40 bg-semantic-warningTint/30 px-4 py-3">
          <p className="font-mono text-mono-sm font-semi text-semantic-warning">
            Memo validation found {validationWarning.length}{" "}
            {validationWarning.length === 1 ? "issue" : "issues"}
          </p>
          <ul className="mt-1 list-disc pl-6 text-body-sm text-ink-2 leading-snug">
            {validationWarning.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="mt-2 text-body-sm text-ink-3">
            The memo is still useful for review; please address the issues
            before sign-off.
          </p>
        </div>
      )}

      <div
        className={cn(
          "grid gap-10",
          hideToc ? "grid-cols-1" : "lg:grid-cols-[200px_minmax(0,760px)] lg:gap-12",
        )}
      >
        {!hideToc && (
          <aside className="hidden lg:block">
            <MemoToc
              status={status}
              hasAppendices={Boolean(
                memo?.appendices && Object.keys(memo.appendices).length > 0,
              )}
            />
          </aside>
        )}

        <article
          className={cn(
            "memo-reading-column max-w-[760px]",
            compact ? "" : "mx-auto lg:mx-0",
          )}
        >
          {!compact && draftingIndex != null && (
            <MemoStreamingStatus
              draftingIndex={draftingIndex}
              draftingSection={draftingKey}
            />
          )}

          {SECTION_ORDER.map((k, i) => renderSection(k, i))}

          {memo?.appendices && Object.keys(memo.appendices).length > 0 && (
            <section
              id="appendices"
              className="border-t border-rule py-10 scroll-mt-[120px]"
            >
              <p className="text-eyebrow uppercase tracking-[0.08em] text-accent-pressed font-mono">
                Appendix
              </p>
              <h2 className="mt-1 font-serif text-h2 font-semi tracking-tight text-ink-1">
                Supporting exhibits
              </h2>
              <ul className="mt-4 flex flex-col gap-1.5 font-serif text-body-sm text-ink-2">
                {Object.keys(memo.appendices).map((k) => (
                  <li key={k}>
                    <span className="font-mono text-mono-sm text-accent-pressed mr-2">
                      [A]
                    </span>
                    {k.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </div>
    </div>
  );
};

// ── helpers ─────────────────────────────────────────────────────────────────

function sectionElement(key: SectionKey, content: unknown): React.ReactNode {
  // Each section's renderer assumes its specific shape; we cast here once.
  switch (key) {
    case "executive_summary":
      return (
        <ExecSummarySection
          data={content as CreditMemoBody["executive_summary"]}
        />
      );
    case "borrower_overview":
      return (
        <BorrowerOverviewSection
          data={content as CreditMemoBody["borrower_overview"]}
        />
      );
    case "financial_analysis":
      return (
        <FinancialAnalysisSection
          data={content as CreditMemoBody["financial_analysis"]}
        />
      );
    case "cash_flow_projection":
      return (
        <CashFlowProjectionSection
          data={content as CreditMemoBody["cash_flow_projection"]}
        />
      );
    case "risk_factors":
      return (
        <RiskFactorsSection
          data={content as CreditMemoBody["risk_factors"]}
        />
      );
    case "collateral":
      return (
        <CollateralSection data={content as CreditMemoBody["collateral"]} />
      );
    case "covenant_package":
      return (
        <CovenantPackageSection
          data={content as CreditMemoBody["covenant_package"]}
        />
      );
    case "regulatory_concentration":
      return (
        <RegulatoryConcentrationSection
          data={content as CreditMemoBody["regulatory_concentration"]}
        />
      );
    case "risk_rating_rationale":
      return (
        <RiskRatingRationaleSection
          data={content as CreditMemoBody["risk_rating_rationale"]}
        />
      );
    case "recommendation":
      return (
        <RecommendationSection
          data={content as CreditMemoBody["recommendation"]}
        />
      );
    default:
      return null;
  }
}

function memoValidationIssues(
  memo: Partial<CreditMemoBody> | null,
): string[] | null {
  if (!memo) return null;
  const issues: string[] = [];
  if (memo.review_status === "revise") {
    issues.push("The memo-reviewer flagged this draft for revision.");
  }
  if (memo.citation_density != null && memo.citation_density < 0.8) {
    issues.push(
      `Citation density ${(memo.citation_density * 100).toFixed(0)}% — below the 80% sign-off threshold.`,
    );
  }
  return issues.length > 0 ? issues : null;
}

const FadeIn: React.FC<{
  children: React.ReactNode;
  keyId: string;
}> = ({ children }) => (
  <div className="memo-fade-in">
    {children}
  </div>
);

const SectionUnavailable: React.FC<{ number: number; title: string }> = ({
  number,
  title,
}) => (
  <section className="my-12 scroll-mt-24">
    <div className="mb-4">
      <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
        Section {number}
      </p>
      <h2 className="mt-1 font-serif text-h2 font-semi text-ink-1">{title}</h2>
    </div>
    <div className="rounded-md border border-rule bg-paper-2 p-5">
      <p className="font-serif text-body-sm text-ink-2 leading-snug">
        This section was not produced for the current memo. The drafter agent
        completed without populating it; the underlying atomic-service
        outputs may not have provided sufficient detail. Open the audit
        trail for diagnostic context.
      </p>
    </div>
  </section>
);
