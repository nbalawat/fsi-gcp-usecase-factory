"use client";

/**
 * Print-clean version of the memo. Used at /cases/[id]/memo/print.
 *
 * - No AppShell, no nav, no buttons (all wrapped with .memo-print-hide which
 *   the @media print CSS hides).
 * - Document only, capped at 760 px content width with bank-grade margins.
 * - Auto-fires window.print() once mounted (after one tick, to give layout
 *   time to settle).
 * - Footer at the foot of every printed page shows borrower / app id / page
 *   X of Y. Page-counter via @page CSS would be ideal, but Chromium ignores it
 *   reliably only with a print library. We instead render a static footer.
 */

import * as React from "react";
import { CreditMemoDocument } from "./credit-memo-document";
import type { Citation, CreditMemoBody } from "./types";

interface Props {
  applicationId: string;
  memo: Partial<CreditMemoBody>;
  /** Auto-trigger the browser print dialog on mount. */
  autoPrint?: boolean;
}

export const MemoPrintView: React.FC<Props> = ({
  applicationId,
  memo,
  autoPrint = true,
}) => {
  React.useEffect(() => {
    if (!autoPrint) return undefined;
    if (typeof window === "undefined") return undefined;
    const id = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // Some headless contexts disallow print — silently swallow.
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [autoPrint]);

  const borrower = memo.executive_summary?.borrower_name ?? "—";

  return (
    <div className="memo-print-page mx-auto max-w-[760px] px-8 py-10">
      {/* Header banner */}
      <header className="mb-6 border-b-2 border-ink-1 pb-4">
        <p className="text-eyebrow uppercase tracking-[0.08em] text-ink-3 font-mono">
          Confidential — Commercial Credit Memo
        </p>
        <h1 className="mt-2 font-serif text-h1 font-semi tracking-tight text-ink-1">
          {borrower}
        </h1>
        <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-mono-sm text-ink-3">
          <span>Application {applicationId}</span>
          {memo.drafted_at && (
            <span>
              Drafted {new Date(memo.drafted_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
          {memo.revision_number != null && (
            <span>Revision {memo.revision_number}</span>
          )}
        </div>
      </header>

      <CreditMemoDocument
        applicationId={applicationId}
        memo={memo}
        hideToc
        compact
      />

      {/* Global citations index — printed appendix that consolidates every
       * citation in the memo with full source details. The per-section footers
       * still print, but examiners typically expect a deduplicated index at
       * the end of the document. */}
      <GlobalCitationsIndex memo={memo} />

      {/* Footer (printed once at end; @page running footer is unreliable). */}
      <footer className="mt-12 border-t border-ink-1 pt-3 font-mono text-mono-sm text-ink-3">
        <div className="flex justify-between">
          <span>{borrower} · {applicationId}</span>
          <span>End of memo</span>
        </div>
      </footer>
    </div>
  );
};

const GlobalCitationsIndex: React.FC<{
  memo: Partial<CreditMemoBody>;
}> = ({ memo }) => {
  const all = collectAllCitations(memo);
  if (all.length === 0) return null;
  return (
    <section className="mt-12 border-t-2 border-ink-1 pt-6">
      <p className="text-eyebrow uppercase tracking-[0.08em] text-ink-3 font-mono">
        Appendix
      </p>
      <h2 className="mt-1 font-serif text-h2 font-semi text-ink-1">
        Sources & Citations
      </h2>
      <ol className="mt-4 flex flex-col gap-2">
        {all.map((c, i) => (
          <li
            key={`${c.source}-${i}`}
            className="font-mono text-mono-sm text-ink-2 leading-snug"
          >
            <span className="font-semi text-ink-1 mr-2">{`[${i + 1}]`}</span>
            <span className="font-semi text-ink-1">{c.source}</span>
            {c.page != null && <span> · p.{c.page}</span>}
            {c.section && <span> · {c.section}</span>}
            <span className="text-ink-3"> — {c.claim}</span>
            {c.excerpt && (
              <span className="block ml-6 mt-1 text-ink-3 italic">
                "{c.excerpt}"
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};

function collectAllCitations(memo: Partial<CreditMemoBody>): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  const push = (c: Citation | undefined | null) => {
    if (!c) return;
    const key = `${c.source}::${c.page ?? ""}::${c.claim.slice(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  memo.executive_summary?.citations?.forEach(push);
  memo.borrower_overview?.citations?.forEach(push);
  memo.financial_analysis?.citations?.forEach(push);
  memo.financial_analysis?.normalization_adjustments?.forEach((a) =>
    push(a.citation),
  );
  memo.cash_flow_projection?.citations?.forEach(push);
  memo.risk_factors?.factors.forEach((f) => f.citations?.forEach(push));
  memo.collateral?.items.forEach((it) => push(it.citation));
  memo.covenant_package?.citations?.forEach(push);
  memo.regulatory_concentration?.citations?.forEach(push);
  memo.risk_rating_rationale?.drivers.forEach((d) => push(d.citation));
  return out;
}
