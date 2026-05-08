"use client";

/**
 * Section 10 — Recommendation.
 *
 * Action + approval authority kicker; terms block (amount, rate, term, fees,
 * prepayment, draws); conditions precedent as a numbered list; closing
 * narrative.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { MemoSection } from "../memo-section";
import {
  decisionLabel,
  fmtPctFraction,
  fmtUsdFull,
  titleCase,
} from "../format";
import type { Recommendation } from "../types";

interface Props {
  data: Recommendation;
}

const decisionTone = (a: string) => {
  if (a === "approve" || a === "approve_conditional") return "success" as const;
  if (a === "decline") return "danger" as const;
  return "warning" as const;
};

export const RecommendationSection: React.FC<Props> = ({ data }) => {
  const t = data.terms ?? ({} as NonNullable<Props["data"]["terms"]>);
  const termYears = Number(t.term_years ?? 0);
  const amortYears = t.amortization_years != null ? Number(t.amortization_years) : null;
  return (
    <MemoSection
      id="recommendation"
      number={10}
      eyebrow="Section 10"
      title="Recommendation"
      kicker={
        <div className="flex items-center gap-2">
          <Badge tone={decisionTone(data.action)} dot>
            {decisionLabel(data.action)}
          </Badge>
          {data.approval_authority && (
            <Badge tone="neutral" dot>
              {titleCase(data.approval_authority)}
            </Badge>
          )}
        </div>
      }
    >
      {data.narrative && <p>{data.narrative}</p>}

      <div className="my-6 grid gap-4 rounded-md border border-rule p-5 md:grid-cols-3">
        <Stat label="Amount" value={fmtUsdFull(t.amount_usd)} />
        <Stat label="Rate" value={t.rate} small />
        <Stat label="Term" value={`${termYears.toFixed(1)} years`} />
        {amortYears != null && (
          <Stat
            label="Amortisation"
            value={`${amortYears.toFixed(1)} years`}
          />
        )}
        {t.balloon_at_maturity && (
          <Stat label="Balloon" value="Yes" />
        )}
        {t.origination_fee_pct != null && (
          <Stat
            label="Origination fee"
            value={fmtPctFraction(t.origination_fee_pct, 2)}
          />
        )}
        {t.annual_fee_bps != null && (
          <Stat
            label="Annual fee"
            value={`${t.annual_fee_bps.toFixed(0)} bps`}
          />
        )}
        {t.prepayment && (
          <Stat label="Prepayment" value={t.prepayment} small />
        )}
        {t.draws && <Stat label="Draws" value={t.draws} small />}
      </div>

      {data.conditions_precedent && data.conditions_precedent.length > 0 && (
        <div className="my-6 rounded-md border border-rule p-5">
          <p className="mb-3 text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
            Conditions precedent
          </p>
          <ol className="flex flex-col gap-2">
            {data.conditions_precedent.map((cp, i) => (
              <li
                key={i}
                className="flex items-baseline gap-3 font-serif text-body text-ink-1 leading-snug"
              >
                <span className="font-mono text-mono-sm text-accent-pressed font-semi w-6 shrink-0">
                  {String(i + 1).padStart(2, "0")}.
                </span>
                <span>{cp}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Closing line */}
      <p className="mt-8 italic text-ink-2 border-l-2 border-accent pl-4">
        Submitted for the consideration of the{" "}
        {data.approval_authority
          ? titleCase(data.approval_authority)
          : "credit committee"}{" "}
        per the bank's delegation of authority matrix.
      </p>
    </MemoSection>
  );
};

const Stat: React.FC<{
  label: string;
  value: string;
  small?: boolean;
}> = ({ label, value, small }) => (
  <div>
    <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3 font-mono">
      {label}
    </p>
    <p
      className={
        small
          ? "mt-1 font-serif text-body-sm text-ink-1 leading-snug"
          : "mt-1 font-serif text-h3 font-semi tabular-nums text-ink-1"
      }
    >
      {value}
    </p>
  </div>
);
