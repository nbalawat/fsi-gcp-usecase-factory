/**
 * Pure function that serialises a credit memo body to a clean markdown
 * document. Intended for the "Copy memo as Markdown" action — the output is
 * banker-quality (tables, citation index, no UI cruft) and pastes cleanly
 * into Google Docs / Word / Quip.
 *
 * No React, no DOM, no formatting libraries — runs everywhere.
 */

import type { CreditMemoBody, Citation } from "../components/credit-memo/types";

const fmtUsd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPctFraction = (n: number, dp = 1): string =>
  `${(n * 100).toFixed(dp)}%`;

const fmtRatio = (n: number, dp = 2): string => `${n.toFixed(dp)}x`;

const titleCase = (s: string): string =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface CitationRecord {
  idx: number;
  c: Citation;
}

class CitationCollector {
  private list: CitationRecord[] = [];
  private byKey = new Map<string, number>();

  ref(c: Citation): string {
    const key = `${c.source}::${c.page ?? ""}::${c.claim.slice(0, 80)}`;
    const existing = this.byKey.get(key);
    if (existing) return `[^${existing}]`;
    const idx = this.list.length + 1;
    this.byKey.set(key, idx);
    this.list.push({ idx, c });
    return `[^${idx}]`;
  }

  footnotes(): string {
    if (this.list.length === 0) return "";
    const lines = this.list.map(({ idx, c }) => {
      const meta = [
        c.source,
        c.page != null ? `p.${c.page}` : null,
        c.section,
      ]
        .filter(Boolean)
        .join(", ");
      const excerpt = c.excerpt ? ` "${c.excerpt.slice(0, 200)}"` : "";
      return `[^${idx}]: ${meta}${excerpt}`;
    });
    return `\n## Citations\n\n${lines.join("\n")}\n`;
  }
}

function table(header: string[], rows: Array<Array<string>>): string {
  const head = `| ${header.join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

export function memoToMarkdown(memo: CreditMemoBody): string {
  const cc = new CitationCollector();
  const out: string[] = [];

  out.push(`# Commercial Credit Memo — ${memo.executive_summary.borrower_name}`);
  out.push("");
  out.push(`*Application ${memo.application_id}*`);
  out.push(`*Drafted ${new Date(memo.drafted_at).toISOString()}*`);
  if (memo.review_status) out.push(`*Status: ${memo.review_status}*`);
  if (memo.citation_density != null) {
    out.push(
      `*Citation density: ${(memo.citation_density * 100).toFixed(0)}%*`,
    );
  }
  out.push("");

  // 1. Executive Summary
  const es = memo.executive_summary;
  out.push("## 1. Executive Summary");
  out.push("");
  out.push(
    `**Borrower:** ${es.borrower_name}  \n**Industry:** ${es.industry}  \n**Loan request:** ${fmtUsd(es.loan_request.amount_usd)} · ${es.loan_request.term_years.toFixed(1)} years · ${titleCase(es.loan_request.facility_type)}` +
      (es.loan_request.pricing ? `  \n**Pricing:** ${es.loan_request.pricing}` : "") +
      `  \n**Recommended risk rating:** ${es.risk_rating}  \n**Recommendation:** ${es.recommendation_action}`,
  );
  out.push("");
  const c0 = es.citations?.[0];
  out.push(`${es.text}${c0 ? cc.ref(c0) : ""}`);
  out.push("");
  out.push("**Highlights:**");
  for (const h of es.highlights) out.push(`- ${h}`);
  out.push("");

  // 2. Borrower Overview
  const bo = memo.borrower_overview;
  out.push("## 2. Borrower Overview");
  out.push("");
  out.push(
    bo.business_description +
      (bo.citations?.[0] ? cc.ref(bo.citations[0]) : ""),
  );
  out.push("");
  if (bo.ownership && bo.ownership.length > 0) {
    out.push("### Ownership");
    out.push(
      table(
        ["Beneficial owner", "Role", "Stake", "Insider"],
        bo.ownership.map((o) => [
          o.name,
          o.role,
          fmtPctFraction(o.stake_pct, 2),
          o.is_insider ? "Yes (12 CFR 215.5)" : "—",
        ]),
      ),
    );
    out.push("");
  }
  if (bo.management_team && bo.management_team.length > 0) {
    out.push("### Senior Management");
    out.push(
      table(
        ["Role", "Officer", "Tenure", "Background"],
        bo.management_team.map((m) => [
          m.role,
          m.name,
          `${m.tenure_years.toFixed(1)}y`,
          m.background ?? "—",
        ]),
      ),
    );
    out.push("");
  }
  out.push(
    `**Customer concentration:** Top 1 ${fmtPctFraction(bo.customer_concentration.top_1_pct, 1)} · Top 5 ${fmtPctFraction(bo.customer_concentration.top_5_pct, 1)}` +
      (bo.customer_concentration.hhi != null
        ? ` · HHI ${bo.customer_concentration.hhi.toFixed(0)}`
        : ""),
  );
  if (bo.customer_concentration.narrative) {
    out.push("");
    out.push(bo.customer_concentration.narrative);
  }
  out.push("");

  // 3. Financial Analysis
  const fa = memo.financial_analysis;
  out.push("## 3. Financial Analysis");
  out.push("");
  out.push(fa.narrative + (fa.citations?.[0] ? cc.ref(fa.citations[0]) : ""));
  out.push("");
  out.push("### Trend");
  out.push(
    table(
      ["Metric", ...fa.trend_table.periods, "Trend"],
      fa.trend_table.rows.map((r) => [
        r.metric,
        ...r.values.map((v) => (v == null ? "—" : String(v))),
        r.trend ?? "—",
      ]),
    ),
  );
  out.push("");
  out.push(`### Peer comparison — NAICS ${fa.peer_comparison.naics_code}`);
  out.push(
    table(
      ["Metric", "Borrower", "P25", "Median", "P75", "Assessment"],
      fa.peer_comparison.rows.map((r) => [
        r.metric,
        String(r.borrower),
        r.p25 != null ? String(r.p25) : "—",
        String(r.median),
        r.p75 != null ? String(r.p75) : "—",
        r.borrower_assessment ?? "—",
      ]),
    ),
  );
  out.push("");

  // 4. Cash Flow Projection
  const cfp = memo.cash_flow_projection;
  out.push("## 4. Cash Flow Projection");
  out.push("");
  out.push(cfp.narrative + (cfp.citations?.[0] ? cc.ref(cfp.citations[0]) : ""));
  out.push("");
  out.push("### Year-3 scenario matrix");
  out.push(
    table(
      [
        "Scenario",
        "Rev CAGR",
        "EBITDA margin",
        "Rate shock",
        "Revenue",
        "EBITDA",
        "Debt service",
        "DSCR",
        "Leverage",
        "Headroom",
      ],
      cfp.scenarios.map((s) => [
        s.label ?? titleCase(s.name),
        fmtPctFraction(s.revenue_cagr, 1),
        fmtPctFraction(s.ebitda_margin, 1),
        `${s.rate_shock_bps} bps`,
        fmtUsd(s.year_3.revenue_usd),
        fmtUsd(s.year_3.ebitda_usd),
        fmtUsd(s.year_3.annual_debt_service_usd),
        fmtRatio(s.year_3.dscr),
        fmtRatio(s.year_3.leverage),
        `${s.year_3.covenant_headroom_dscr_pct.toFixed(1)}%`,
      ]),
    ),
  );
  out.push("");

  // 5. Risk Factors
  out.push("## 5. Risk Factors");
  out.push("");
  for (const [i, f] of memo.risk_factors.factors.entries()) {
    out.push(`### ${i + 1}. ${f.name} — Severity ${f.severity_1_10}/10`);
    out.push("");
    out.push(
      `**Evidence:** ${f.evidence}` +
        (f.citations?.[0] ? cc.ref(f.citations[0]) : ""),
    );
    out.push("");
    out.push(`**Mitigation:** ${f.mitigation}`);
    out.push("");
  }

  // 6. Collateral
  const col = memo.collateral;
  out.push("## 6. Collateral");
  out.push("");
  if (col.narrative) out.push(col.narrative);
  out.push("");
  out.push(
    table(
      ["Type", "Description", "Appraised", "Haircut", "Lendable", "Lien"],
      col.items.map((it) => [
        titleCase(it.type),
        it.description ?? "—",
        fmtUsd(it.appraised_value_usd),
        fmtPctFraction(it.haircut_pct, 0),
        fmtUsd(it.lendable_value_usd),
        it.lien_position ?? "—",
      ]),
    ),
  );
  out.push("");
  out.push(
    `**Coverage:** ${fmtUsd(col.total_pledged_usd)} lendable / ${fmtUsd(col.loan_amount_usd)} loan = ${(col.coverage_pct * 100).toFixed(0)}%`,
  );
  out.push("");

  // 7. Covenants
  const cov = memo.covenant_package;
  out.push("## 7. Covenant Package");
  out.push("");
  if (cov.narrative) out.push(cov.narrative);
  out.push("");
  out.push("### Maintenance covenants");
  out.push(
    table(
      ["Name", "Threshold", "Test", "Grace", "Headroom @ base"],
      cov.maintenance_covenants.map((c) => [
        titleCase(c.name),
        `${c.threshold}${c.threshold_unit ?? ""}`,
        c.test_frequency,
        c.grace_period_days != null ? `${c.grace_period_days}d` : "—",
        c.headroom_pct_at_base != null
          ? `${c.headroom_pct_at_base.toFixed(1)}%`
          : "—",
      ]),
    ),
  );
  out.push("");
  out.push(`**Reporting cadence:** ${cov.reporting_cadence}`);
  out.push("");

  // 8. Regulatory & Concentration
  const rc = memo.regulatory_concentration;
  out.push("## 8. Regulatory & Concentration");
  out.push("");
  out.push(
    `**Single-borrower limit (${rc.single_borrower_limit.regulation ?? "12 CFR 32.3"}):** Total exposure ${fmtUsd(rc.single_borrower_limit.total_exposure_usd)} = ${fmtPctFraction(rc.single_borrower_limit.exposure_pct, 2)} of Tier 1 capital. Cap ${fmtPctFraction(rc.single_borrower_limit.cap_pct, 0)}. **${rc.single_borrower_limit.compliant ? "Compliant" : "Exceeds limit"}.**`,
  );
  out.push("");
  out.push(
    `**Reg O (${rc.reg_o_check.regulation ?? "12 CFR 215.5"}):** Insider ${rc.reg_o_check.is_insider ? "Yes" : "No"}. Board approval ${rc.reg_o_check.board_approval_required ? "required" : "not required"}.`,
  );
  out.push("");
  out.push(
    `**Fair lending (${rc.fair_lending.regulation ?? "Reg B / ECOA"}):** ${rc.fair_lending.pricing_within_band ? "Within band" : "Outside band"} (Δ ${rc.fair_lending.delta_bps_vs_peers > 0 ? "+" : ""}${rc.fair_lending.delta_bps_vs_peers.toFixed(0)} bps vs peers).`,
  );
  out.push("");

  // 9. Risk Rating Rationale
  const rr = memo.risk_rating_rationale;
  out.push(`## 9. Risk Rating Rationale — ${rr.risk_band}`);
  out.push("");
  if (rr.narrative) out.push(rr.narrative);
  out.push("");
  out.push(
    table(
      ["Factor", "Assessment", "Evidence"],
      rr.drivers.map((d) => [d.factor, d.assessment, d.evidence]),
    ),
  );
  out.push("");
  if (rr.identified_weaknesses && rr.identified_weaknesses.length > 0) {
    out.push("### Identified weaknesses");
    for (const w of rr.identified_weaknesses) {
      out.push(`- **${w.weakness}** — ${w.mitigation}`);
    }
    out.push("");
  }

  // 10. Recommendation
  const re = memo.recommendation;
  out.push("## 10. Recommendation");
  out.push("");
  out.push(`**Action:** ${re.action.toUpperCase()}`);
  if (re.approval_authority) {
    out.push(`**Approval authority:** ${titleCase(re.approval_authority)}`);
  }
  out.push("");
  if (re.narrative) out.push(re.narrative);
  out.push("");
  out.push("### Terms");
  out.push(
    `- **Amount:** ${fmtUsd(re.terms.amount_usd)}\n- **Rate:** ${re.terms.rate}\n- **Term:** ${re.terms.term_years.toFixed(1)} years` +
      (re.terms.amortization_years
        ? `\n- **Amortisation:** ${re.terms.amortization_years.toFixed(1)} years`
        : "") +
      (re.terms.balloon_at_maturity ? `\n- **Balloon at maturity:** Yes` : "") +
      (re.terms.origination_fee_pct != null
        ? `\n- **Origination fee:** ${fmtPctFraction(re.terms.origination_fee_pct, 2)}`
        : "") +
      (re.terms.annual_fee_bps != null
        ? `\n- **Annual fee:** ${re.terms.annual_fee_bps} bps`
        : ""),
  );
  out.push("");
  if (re.conditions_precedent && re.conditions_precedent.length > 0) {
    out.push("### Conditions precedent");
    for (const cp of re.conditions_precedent) out.push(`- ${cp}`);
    out.push("");
  }

  // Citations footnotes
  out.push(cc.footnotes());

  return out.join("\n");
}
