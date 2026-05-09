"use client";

/**
 * Returned-application panel — replaces the credit memo body when
 * the validation gate routed the application to RETURN_FOR_REVISION.
 *
 * Reads the return_notice artifact (artifact_type='return_notice'),
 * which is the same shape as the validation gate's ValidationResult.
 *
 * The underwriter (or RM, depending on persona) sees an actionable
 * checklist with one row per missing item, links to the originator,
 * and a one-click "send to applicant" button that publishes a
 * .returned event the customer-portal mailer consumes.
 */

import * as React from "react";
import { cn } from "@/lib/ui";

interface MissingItem {
  code:
    | "missing_doc_type"
    | "extraction_failed"
    | "critical_field_missing"
    | "incomplete_application";
  doc_type: string | null;
  doc_id: string | null;
  field_path: string | null;
  applicant_message: string;
  severity: "critical" | "warning";
  regulation: string | null;
}

interface ReturnNotice {
  application_id: string;
  decision: "RETURN_FOR_REVISION";
  missing_items: MissingItem[];
  submitted_doc_types: string[];
  tier_reason: string | null;
  next_steps: string;
}

interface Props {
  notice: ReturnNotice;
  borrower_name: string;
  loan_amount_usd: number;
  on_send_to_applicant?: () => void;
  className?: string;
}

const CODE_LABEL: Record<MissingItem["code"], string> = {
  missing_doc_type: "Missing document",
  extraction_failed: "Document extraction failed",
  critical_field_missing: "Required field not found",
  incomplete_application: "Application incomplete",
};

const SEVERITY_TONE = {
  critical: "border-rose-200 bg-rose-50",
  warning: "border-amber-200 bg-amber-50",
};

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export function ReturnedApplicationPanel({
  notice,
  borrower_name,
  loan_amount_usd,
  on_send_to_applicant,
  className,
}: Props): React.ReactElement {
  const critical = notice.missing_items.filter((i) => i.severity === "critical");
  const warnings = notice.missing_items.filter((i) => i.severity === "warning");

  return (
    <section
      className={cn(
        "rounded-lg border-2 border-amber-300 bg-amber-50/30 p-6 shadow-sm",
        className,
      )}
      aria-label="Returned application"
    >
      <header className="flex items-start justify-between gap-4 border-b border-amber-200 pb-4">
        <div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
            Return for revision
          </span>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            Cannot underwrite as submitted
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            {borrower_name} · {fmtUsd(loan_amount_usd)} · application
            ID&nbsp;
            <code className="font-mono text-xs text-slate-500">
              {notice.application_id.slice(0, 8)}
            </code>
          </p>
        </div>

        {on_send_to_applicant ? (
          <button
            type="button"
            onClick={on_send_to_applicant}
            className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-800"
          >
            Send to applicant
          </button>
        ) : null}
      </header>

      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-800">{notice.next_steps}</p>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Submitted documents
          </h3>
          <p className="text-xs text-slate-700">
            {notice.submitted_doc_types.length > 0
              ? notice.submitted_doc_types.join(", ")
              : "(none)"}
          </p>
        </div>

        {critical.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-rose-900">
              Required actions ({critical.length})
            </h3>
            <ol className="mt-2 space-y-2">
              {critical.map((item, i) => (
                <li
                  key={i}
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    SEVERITY_TONE.critical,
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-rose-900">
                      {i + 1}. {CODE_LABEL[item.code]}
                      {item.doc_type ? ` — ${item.doc_type}` : ""}
                    </span>
                    {item.regulation ? (
                      <code className="text-xs text-rose-700">
                        {item.regulation}
                      </code>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-rose-900">
                    {item.applicant_message}
                  </p>
                  {item.field_path ? (
                    <p className="mt-1 font-mono text-xs text-rose-700">
                      Field: {item.field_path}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Warnings ({warnings.length})
            </h3>
            <ol className="mt-2 space-y-2">
              {warnings.map((item, i) => (
                <li
                  key={i}
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    SEVERITY_TONE.warning,
                  )}
                >
                  <span className="font-semibold text-amber-900">
                    {CODE_LABEL[item.code]}
                  </span>
                  <p className="mt-1 text-sm text-amber-900">
                    {item.applicant_message}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {notice.tier_reason ? (
          <p className="rounded bg-slate-100 p-3 text-xs text-slate-700">
            <strong>Bank policy reference:</strong> {notice.tier_reason}
          </p>
        ) : null}
      </div>
    </section>
  );
}
