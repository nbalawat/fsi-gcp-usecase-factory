"use client";

/**
 * Section 8 — Regulatory & Concentration.
 *
 * Single-borrower limit (12 CFR 32.3), Reg O insider check (12 CFR 215.5),
 * appraisal regulation (12 CFR 34.43), fair-lending pricing-band check
 * (Reg B / ECOA), BSA/AML/OFAC. Each block is a small card with the headline
 * compliance state and the regulation citation.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { CitationSuperscript } from "../citation-superscript";
import { MemoSection } from "../memo-section";
import { fmtBps, fmtPctFraction, fmtUsdFull } from "../format";
import type { RegulatoryConcentration } from "../types";

interface Props {
  data: RegulatoryConcentration;
}

export const RegulatoryConcentrationSection: React.FC<Props> = ({ data }) => {
  const cites = data.citations ?? [];
  const sbl = data.single_borrower_limit ?? {} as RegulatoryConcentration["single_borrower_limit"];
  const reg = data.reg_o_check ?? {} as RegulatoryConcentration["reg_o_check"];
  const fair = data.fair_lending ?? {} as RegulatoryConcentration["fair_lending"];
  const ofac = data.bsa_aml_ofac;
  const appraisal = data.appraisal_check;

  return (
    <MemoSection
      id="regulatory_concentration"
      number={8}
      eyebrow="Section 8"
      title="Regulatory & Concentration"
      prefillCitations={cites}
    >
      <p>
        The proposed credit has been screened against the operative federal
        regulations governing single-borrower concentration, insider lending,
        appraisal practices, and fair-lending pricing. The findings are
        summarized below; underlying calculations are reproduced in the
        appendices.
        {cites[0] && <CitationSuperscript citation={cites[0]} />}
      </p>

      <div className="my-6 grid gap-4 md:grid-cols-2">
        {/* Single-borrower limit */}
        <Block
          regulation={sbl.regulation ?? "12 CFR 32.3"}
          title="Single-borrower lending limit"
          tone={sbl.compliant ? "success" : "danger"}
          stateLabel={sbl.compliant ? "Compliant" : "Exceeds limit"}
        >
          <KV label="Total exposure" value={fmtUsdFull(sbl.total_exposure_usd)} />
          <KV label="Tier 1 capital" value={fmtUsdFull(sbl.tier1_capital_usd)} />
          <KV
            label="Exposure / Tier 1"
            value={fmtPctFraction(sbl.exposure_pct, 2)}
            highlight
          />
          <KV label="Cap" value={fmtPctFraction(sbl.cap_pct, 0)} />
          {cites[1] && (
            <p className="mt-2 text-body-sm text-muted-foreground">
              Exposure includes existing utilised facilities plus the proposed
              term loan.
              <CitationSuperscript citation={cites[1]} />
            </p>
          )}
        </Block>

        {/* Reg O */}
        <Block
          regulation={reg.regulation ?? "12 CFR 215.5"}
          title="Reg O — insider lending"
          tone={
            reg.is_insider
              ? reg.board_approval_required
                ? "warning"
                : "danger"
              : "success"
          }
          stateLabel={
            reg.is_insider
              ? reg.board_approval_required
                ? "Board approval required"
                : "Insider — review needed"
              : "Not an insider"
          }
        >
          <KV
            label="Insider match"
            value={reg.is_insider ? "Yes" : "No"}
            highlight
          />
          {reg.related_to && (
            <KV label="Related to" value={reg.related_to} />
          )}
          {reg.insider_match_confidence != null && (
            <KV
              label="Match confidence"
              value={fmtPctFraction(reg.insider_match_confidence, 0)}
            />
          )}
          {reg.estimated_board_meeting && (
            <KV
              label="Earliest board meeting"
              value={new Date(reg.estimated_board_meeting).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              )}
            />
          )}
          {cites[2] && (
            <p className="mt-2 text-body-sm text-muted-foreground">
              Screening was performed against the bank's insider register and
              the borrower's Schedule 13G filings.
              <CitationSuperscript citation={cites[2]} />
            </p>
          )}
        </Block>

        {/* Appraisal */}
        {appraisal && (
          <Block
            regulation={appraisal.regulation ?? "12 CFR 34.43"}
            title="Appraisal (real estate)"
            tone={appraisal.required ? "warning" : "success"}
            stateLabel={
              appraisal.required ? "Appraisal required" : "Not required"
            }
          >
            {appraisal.rationale && (
              <p className="font-serif text-body-sm text-foreground leading-snug">
                {appraisal.rationale}
                {cites[3] && <CitationSuperscript citation={cites[3]} />}
              </p>
            )}
          </Block>
        )}

        {/* Fair lending */}
        <Block
          regulation={fair.regulation ?? "Reg B / ECOA"}
          title="Fair-lending pricing band"
          tone={fair.pricing_within_band ? "success" : "warning"}
          stateLabel={
            fair.pricing_within_band ? "Within band" : "Outside band"
          }
        >
          <KV
            label="Δ vs peers"
            value={fmtBps(fair.delta_bps_vs_peers)}
            highlight
          />
          {cites[4] && (
            <p className="mt-2 text-body-sm text-muted-foreground">
              Pricing benchmarked against the syndicated commercial-loan band
              for the borrower's risk rating and tenor.
              <CitationSuperscript citation={cites[4]} />
            </p>
          )}
        </Block>

        {/* BSA / AML / OFAC */}
        {ofac && (
          <Block
            regulation="BSA / AML"
            title="BSA / AML / OFAC screening"
            tone={
              ofac.ofac_clear === false || ofac.kyc_complete === false
                ? "danger"
                : "success"
            }
            stateLabel={
              ofac.ofac_clear === false
                ? "OFAC hit"
                : ofac.kyc_complete === false
                  ? "KYC incomplete"
                  : "Cleared"
            }
          >
            <KV
              label="OFAC clear"
              value={ofac.ofac_clear === false ? "No" : "Yes"}
            />
            <KV
              label="KYC complete"
              value={ofac.kyc_complete === false ? "No" : "Yes"}
            />
            {ofac.screening_notes && (
              <p className="mt-2 font-serif text-body-sm text-foreground/85 leading-snug">
                {ofac.screening_notes}
                {cites[5] && <CitationSuperscript citation={cites[5]} />}
              </p>
            )}
          </Block>
        )}
      </div>
    </MemoSection>
  );
};

const toneBadge: Record<string, "success" | "warning" | "danger"> = {
  success: "success",
  warning: "warning",
  danger: "danger",
};

const Block: React.FC<{
  regulation: string;
  title: string;
  tone: "success" | "warning" | "danger";
  stateLabel: string;
  children: React.ReactNode;
}> = ({ regulation, title, tone, stateLabel, children }) => (
  <div className="rounded-md border border-border p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-serif text-h4 font-semi text-foreground">{title}</h3>
      <Badge tone={toneBadge[tone]} dot>
        {stateLabel}
      </Badge>
    </div>
    <p className="mt-1 font-mono text-mono-sm text-muted-foreground">{regulation}</p>
    <div className="mt-4 flex flex-col gap-2">{children}</div>
  </div>
);

const KV: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
}> = ({ label, value, highlight }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-eyebrow uppercase tracking-[0.06em] text-muted-foreground font-mono">
      {label}
    </span>
    <span
      className={
        highlight
          ? "font-mono text-mono tabular-nums font-semi text-foreground"
          : "font-mono text-mono-sm tabular-nums text-foreground/85"
      }
    >
      {value}
    </span>
  </div>
);
