"use client";

/**
 * Section 1 — Executive Summary.
 *
 * Big-picture page-1 content the credit officer reads before anything else.
 * Layout: a borrower header card with industry + ask + risk band; a 5-bullet
 * highlights list; the 1-page narrative; citations footer.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { CitationSuperscript } from "../citation-superscript";
import { MemoSection } from "../memo-section";
import {
  decisionLabel,
  fmtUsdMillions,
  riskBandLabel,
  titleCase,
} from "../format";
import type { ExecutiveSummary } from "../types";

interface Props {
  data: ExecutiveSummary;
}

const bandTone = (band: string | null | undefined) => {
  const b = String(band ?? "");
  if (b.startsWith("1")) return "success" as const;
  if (b.startsWith("2") || b.startsWith("3")) return "warning" as const;
  if (b.startsWith("4") || b.startsWith("5")) return "danger" as const;
  return "neutral" as const;
};

const decisionTone = (a: string | null | undefined) => {
  const v = String(a ?? "");
  if (v === "approve" || v === "approve_conditional") return "success" as const;
  if (v === "decline") return "danger" as const;
  if (v === "return_for_revision") return "warning" as const;
  return "neutral" as const;
};

/**
 * If the drafter agent stuffed its full memo JSON into the text field
 * (`{"credit_memo": {…}}` or just `{"executive_summary": {…}}`), parse and
 * pull out the actual narrative string. Otherwise return the text unchanged.
 */
const extractNarrative = (text: string | null | undefined): string => {
  if (!text) return "";
  const trimmed = String(text).trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    // Common drafter wrappers: `{credit_memo: {...}}` or top-level memo shape.
    const memo =
      (parsed && typeof parsed === "object" && (parsed.credit_memo ?? parsed)) || {};
    const exec = memo.executive_summary ?? memo;
    return (
      exec.narrative ??
      exec.text ??
      exec.summary ??
      memo.summary ??
      memo.recommendation_narrative ??
      trimmed
    );
  } catch {
    return trimmed;
  }
};

export const ExecSummarySection: React.FC<Props> = ({ data }) => {
  // Pull a couple citations forward so the narrative reads grounded.
  const cites = data.citations ?? [];
  const c0 = cites[0];
  const c1 = cites[1];
  const narrative = extractNarrative(data.text);

  return (
    <MemoSection
      id="executive_summary"
      number={1}
      eyebrow="Section 1"
      title="Executive Summary"
      prefillCitations={cites}
      kicker={
        <div className="flex items-center gap-2">
          <Badge tone={bandTone(data.risk_rating)} dot>
            {riskBandLabel(data.risk_rating)}
          </Badge>
          <Badge tone={decisionTone(data.recommendation_action)} dot>
            {decisionLabel(data.recommendation_action)}
          </Badge>
        </div>
      }
    >
      {/* Header card with the big numbers */}
      <div className="mb-6 grid grid-cols-2 gap-4 rounded-md border border-rule bg-paper-2 p-5 md:grid-cols-4">
        <Stat label="Borrower" value={data.borrower_name} />
        <Stat
          label="Industry"
          value={data.industry}
          mono={false}
          small
        />
        <Stat
          label="Loan request"
          value={fmtUsdMillions(data.loan_request?.amount_usd)}
          sub={
            data.loan_request?.term_years != null
              ? `${Number(data.loan_request.term_years).toFixed(1)}y · ${titleCase(data.loan_request.facility_type)}`
              : titleCase(data.loan_request?.facility_type) || "—"
          }
        />
        <Stat
          label="Pricing"
          value={data.loan_request?.pricing ?? "—"}
          mono={true}
          small
        />
      </div>

      {/* Narrative */}
      <p>
        {narrative}
        {c0 && <CitationSuperscript citation={c0} />}
        {c1 && <CitationSuperscript citation={c1} />}
      </p>

      {/* Highlights */}
      <div className="mt-6 rounded-md border border-rule p-5">
        <p className="mb-3 text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
          Underwriter highlights
        </p>
        <ul className="flex flex-col gap-2">
          {(data.highlights ?? []).map((h, i) => {
            const c = cites[i + 2];
            return (
              <li
                key={i}
                className="flex items-start gap-3 font-serif text-body text-ink-1 leading-snug"
              >
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>
                  {h}
                  {c && <CitationSuperscript citation={c} />}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </MemoSection>
  );
};

const Stat: React.FC<{
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  small?: boolean;
}> = ({ label, value, sub, mono = false, small = false }) => (
  <div>
    <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
      {label}
    </p>
    <p
      className={
        mono
          ? "mt-1 font-mono text-mono tabular-nums text-ink-1"
          : small
            ? "mt-1 font-serif text-body-sm font-semi text-ink-1 leading-tight"
            : "mt-1 font-serif text-h3 font-semi tabular-nums text-ink-1"
      }
    >
      {value}
    </p>
    {sub && (
      <p className="mt-0.5 font-mono text-mono-sm text-ink-3">{sub}</p>
    )}
  </div>
);
