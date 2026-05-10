"use client";

/**
 * MemoWithEdit — client-side wrapper that adds the banker edit flow
 * around CreditMemoDocument.
 *
 * Owns: drawer open/closed state, currently-edited section key.
 * Provides: onEditSection callback via MemoEditProvider so any memo
 * section can request the editor without prop drilling.
 *
 * The case page (Server Component) renders <MemoWithEdit memo={...} />
 * instead of <CreditMemoDocument /> directly. CreditMemoDocument's
 * children are wrapped in MemoEditProvider so all the section components
 * pick up the handler via context.
 */

import * as React from "react";

import { CreditMemoDocument } from "./credit-memo-document";
import { MemoEditDrawer, type SuggestedChunk } from "./memo-edit-drawer";
import { MemoEditProvider } from "./memo-edit-context";
import type { CreditMemoBody } from "./types";

interface DocOption {
  doc_id: string;
  doc_type: string;
  original_filename: string;
  page_count: number | null;
}

interface Props {
  applicationId: string;
  memo: Partial<CreditMemoBody>;
  available_documents: DocOption[];
  /** Extracted chunks from each uploaded doc — feeds the citation
   *  suggestion list inside the edit drawer. */
  suggested_chunks: SuggestedChunk[];
  hideToc?: boolean;
}

const SECTION_TITLES: Record<string, string> = {
  executive_summary: "Executive Summary",
  borrower_overview: "Borrower Overview",
  financial_analysis: "Financial Analysis",
  cash_flow_projection: "Cash Flow Projection",
  risk_factors: "Risk Factors",
  collateral: "Collateral",
  covenant_package: "Covenant Package",
  regulatory_concentration: "Regulatory & Concentration",
  risk_rating_rationale: "Risk Rating Rationale",
  recommendation: "Recommendation",
};

export function MemoWithEdit({
  applicationId,
  memo,
  available_documents,
  suggested_chunks,
  hideToc,
}: Props): React.ReactElement {
  const [editingKey, setEditingKey] = React.useState<string | null>(null);

  interface DraftCitation {
    doc_id: string;
    page: number;
    excerpt: string;
  }

  const initial = React.useMemo<
    { narrative: string; citations: DraftCitation[] } | null
  >(() => {
    if (!editingKey) return null;
    const section = (memo as Record<string, unknown>)[editingKey] as
      | Record<string, unknown>
      | undefined;
    if (!section) {
      return { narrative: "", citations: [] };
    }
    // Each section uses a slightly different field name for its prose;
    // try the common ones in priority order.
    const narrative =
      (section.narrative as string | undefined) ??
      (section.text as string | undefined) ??
      (section.summary as string | undefined) ??
      (section.business_description as string | undefined) ??
      "";
    const citationsRaw = Array.isArray(section.citations)
      ? (section.citations as unknown[])
      : [];
    const citations: DraftCitation[] = [];
    for (const c of citationsRaw) {
      if (!c || typeof c !== "object") continue;
      const r = c as Record<string, unknown>;
      const doc_id = typeof r.doc_id === "string" ? r.doc_id : "";
      const page = typeof r.page === "number" ? r.page : 0;
      if (!doc_id || page < 1) continue;
      const excerpt = typeof r.excerpt === "string" ? r.excerpt : "";
      citations.push({ doc_id, page, excerpt });
    }
    return { narrative, citations };
  }, [editingKey, memo]);

  return (
    <MemoEditProvider onEditSection={setEditingKey}>
      <CreditMemoDocument
        applicationId={applicationId}
        memo={memo}
        hideToc={hideToc}
      />
      {editingKey && initial ? (
        <MemoEditDrawer
          application_id={applicationId}
          section_key={editingKey}
          section_title={SECTION_TITLES[editingKey] ?? editingKey}
          initial_narrative={initial.narrative}
          initial_citations={initial.citations}
          available_documents={available_documents}
          suggested_chunks={suggested_chunks}
          on_close={() => setEditingKey(null)}
        />
      ) : null}
    </MemoEditProvider>
  );
}
