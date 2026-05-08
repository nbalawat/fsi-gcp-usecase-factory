/**
 * LECO_MEMO_FIXTURE — fully-populated `CreditMemoBody` for the Lincoln Electric
 * (LECO) hero scenario, used to render the credit-memo UI in development with
 * `?mock=1`. Numbers are realistic for a NAICS 333992 (welding & cutting
 * equipment) manufacturer of LECO's scale: revenue ~$4B, leverage 0.9x,
 * DSCR ~20x, single-borrower exposure 7.4% of Tier 1.
 *
 * Voice: senior staff underwriter — direct, declarative, citation-dense, no
 * marketing tone. Every material claim has a source_citation.
 */

import type { CreditMemoBody, Citation } from "../components/credit-memo/types";

const C = (
  source: string,
  page: number | null,
  claim: string,
  excerpt?: string,
  kind: Citation["kind"] = "10-K_page",
  section?: string,
): Citation => ({
  source,
  page,
  section: section ?? null,
  excerpt: excerpt ?? "",
  claim,
  kind,
});

export const LECO_MEMO_FIXTURE: CreditMemoBody = {
  version: "1.0",
  application_id: "00000000-0000-4000-8000-00000000ec01",
  borrower_id: "LECO-001",
  drafted_at: "2026-05-07T15:42:11.000Z",
  drafted_by: "memo-drafter@1.0",
  revision_number: 2,
  review_status: "reviewed",
  citation_density: 0.86,

  executive_summary: {
    borrower_name: "Lincoln Electric Holdings, Inc.",
    industry: "Welding & Cutting Equipment Manufacturing (NAICS 333992)",
    loan_request: {
      amount_usd: 25_000_000,
      term_years: 5,
      facility_type: "term_loan",
      pricing: "SOFR + 165 bps · five-year fixed via interest-rate swap",
    },
    risk_rating: "1-pass",
    recommendation_action: "approve",
    highlights: [
      "Investment-grade balance sheet — net leverage 0.9x with $1.21B of cash on hand at FY24 year-end.",
      "Twelve consecutive years of positive free cash flow; FY22–FY24 averaged $463M of FCF on $4.0B of revenue.",
      "Customer base is broadly diversified across welding distributors, automotive OEMs, and energy infrastructure; top-1 customer 8.2% of revenue.",
      "Single-borrower exposure post-funding is 7.4% of Tier 1 capital, well within the 10% ceiling per 12 CFR 32.3.",
      "DSCR base case is 20.4x against the 1.25x covenant floor — headroom of 1,532% leaves ample cushion against any plausible stress.",
    ],
    text:
      "Lincoln Electric Holdings, Inc. (NYSE: LECO) is requesting a $25.0M five-year senior unsecured term loan to fund the working-capital needs of its automation-systems segment and to repay $18.4M of inter-company debt to Lincoln Electric Automation EMEA. The borrower is a global designer and manufacturer of welding consumables, equipment, automation, and cutting solutions, headquartered in Cleveland, Ohio and operating 64 manufacturing facilities in 22 countries. FY24 revenue was $4,007M against EBITDA of $749M (18.7% margin); net leverage at year-end was 0.9x. The company has reported positive free cash flow in each of the last twelve consecutive fiscal years, and held $1,210M of cash and equivalents at December 31, 2024. The proposed credit would bring Lincoln Electric's total exposure with the Bank to $97.0M, equal to 7.4% of the Bank's Tier 1 capital — within the 10% single-borrower ceiling per 12 CFR 32.3. Underwriting recommends approval at a Pass (1) risk rating with a standard maintenance-covenant package: DSCR floor 1.25x and leverage cap 3.50x, both of which are met with substantial headroom in every modeled scenario.",
    citations: [
      C(
        "LECO 10-K_2024.pdf",
        2,
        "Borrower is a global designer and manufacturer of welding equipment headquartered in Cleveland, Ohio.",
        "The Lincoln Electric Company, founded in 1895 and headquartered in Cleveland, Ohio, is the world's leading manufacturer of arc-welding products, automated joining, assembly and cutting systems...",
        "10-K_page",
        "Item 1 — Business",
      ),
      C(
        "LECO 10-K_2024.pdf",
        43,
        "FY24 revenue $4,007M and EBITDA $749M (18.7% margin).",
        "Net sales for the year ended December 31, 2024 were $4,007.4 million. Operating income was $668.0 million; depreciation and amortization of $80.6 million yields adjusted EBITDA of $748.6 million.",
        "10-K_page",
        "MD&A — Results of Operations",
      ),
      C(
        "LECO 10-K_2024.pdf",
        51,
        "Twelve consecutive years of positive free cash flow.",
        "Operating cash flow has exceeded capital expenditures in each of the years ended December 31, 2013 through December 31, 2024, generating positive free cash flow in each period.",
        "10-K_page",
        "MD&A — Liquidity",
      ),
      C(
        "LECO 10-K_2024.pdf",
        F(50),
        "Top customer represents 8.2% of FY24 net sales.",
        "No single customer represented more than 10% of consolidated net sales in 2022, 2023, or 2024. The largest customer accounted for 8.2% of net sales in 2024.",
        "10-K_page",
        "MD&A — Concentration of credit risk",
      ),
      C(
        "Bank Tier 1 Capital Snapshot 2026-04-30.pdf",
        1,
        "Bank Tier 1 capital was $1,308M as of April 30, 2026.",
        "Common Equity Tier 1 capital: $1,308.0M. Total risk-based capital: $1,560.4M. Risk-based capital ratio: 13.7%.",
        "internal_policy",
        "Capital position",
      ),
      C(
        "12 CFR 32.3",
        null,
        "12 CFR 32.3 establishes a 10% single-borrower lending limit on combined capital and surplus.",
        "A national bank's loans and extensions of credit to any one borrower may not exceed 15 percent of the bank's capital and surplus, plus an additional 10 percent if the loan is fully secured by readily marketable collateral.",
        "regulation",
        "Lending limit",
      ),
      C(
        "DSCR-calculator service output 2026-05-07.json",
        null,
        "Base-case DSCR is 20.4x against the proposed 1.25x covenant.",
        "{\"scenario\":\"base\",\"year_3\":{\"dscr\":20.4,\"headroom_pct\":1532.0}}",
        "service_output",
        "DSCR base-case",
      ),
    ],
  },

  borrower_overview: {
    business_description:
      "Lincoln Electric Holdings, Inc. designs and manufactures arc-welding consumables and equipment, automation systems, and plasma- and oxy-fuel cutting equipment. The company operates through three segments — Americas Welding (~57% of FY24 revenue), International Welding (~25%), and The Harris Products Group (~18%, brazing and soldering). Lincoln serves customers across general fabrication, transportation, energy, automotive, infrastructure, and aerospace end-markets. The borrower has been continuously listed on the NYSE since 1995 and traces its founding to 1895. End-market diversification is a structural strength: no single end-market represented more than 25% of FY24 revenue, and no single customer exceeded 10% in any of the last three fiscal years.",
    ownership: [
      {
        name: "Public float",
        stake_pct: 0.913,
        role: "Public shareholders (NYSE: LECO)",
        is_insider: false,
      },
      {
        name: "BlackRock, Inc.",
        stake_pct: 0.082,
        role: "Institutional asset manager",
        is_insider: false,
      },
      {
        name: "The Vanguard Group, Inc.",
        stake_pct: 0.078,
        role: "Institutional asset manager",
        is_insider: false,
      },
      {
        name: "Steven B. Hedlund",
        stake_pct: 0.005,
        role: "President & CEO — direct + restricted shares",
        is_insider: false,
      },
    ],
    management_team: [
      {
        role: "CEO",
        name: "Steven B. Hedlund",
        tenure_years: 20.0,
        background:
          "Joined Lincoln Electric in 2005; appointed CEO in November 2023. Previously SVP & President of International Welding. Holds an MBA from Harvard.",
      },
      {
        role: "CFO",
        name: "Gabriel Bruno",
        tenure_years: 27.0,
        background:
          "Joined the company in 1995; CFO since 2004. CPA. Long tenure cited by Moody's in the FY24 outlook upgrade.",
      },
      {
        role: "COO",
        name: "Michele Kuhrt",
        tenure_years: 22.0,
        background:
          "Joined in 2003. Prior roles include EVP HR & Compliance and President of Latin America. MBA from Case Western Reserve.",
      },
      {
        role: "GC",
        name: "Jennifer Ansberry",
        tenure_years: 11.0,
        background:
          "Appointed General Counsel in 2018. Member of the Ohio bar.",
      },
    ],
    customer_concentration: {
      top_1_pct: 0.082,
      top_5_pct: 0.243,
      hhi: 412,
      narrative:
        "Customer concentration is moderate. The largest customer represents 8.2% of FY24 revenue and the top five represent 24.3%. The HHI of 412 places Lincoln in the lowest-concentration quartile of the RMA NAICS 333992 peer set (median HHI 1,180, n=43). No single end-market accounted for more than 25% of FY24 net sales.",
    },
    supplier_concentration: {
      top_1_pct: 0.094,
      narrative:
        "Steel coil and rod represent the bulk of inputs and are sourced from a diversified panel of North-American mills. The largest single supplier (Cleveland-Cliffs Inc.) represented 9.4% of FY24 raw-material spend.",
    },
    related_party_transactions: [
      "Aggregate inter-company funding from Lincoln Electric Automation EMEA to the U.S. parent of $18.4M at 12/31/24, included in long-term debt and to be repaid with the proposed proceeds.",
    ],
    citations: [
      C(
        "LECO 10-K_2024.pdf",
        4,
        "Three operating segments: Americas Welding, International Welding, Harris Products Group.",
        "We report financial results in three operating segments: Americas Welding, International Welding, and The Harris Products Group.",
        "10-K_page",
        "Item 1 — Segments",
      ),
      C(
        "LECO 10-K_2024.pdf",
        F(50),
        "HHI of 412 vs RMA peer median of 1,180.",
        "HHI of customer concentration computed across top-25 customers; the company's HHI of 412 is roughly one-third of the RMA NAICS 333992 peer median.",
        "peer_table",
        "Customer concentration analytics",
      ),
      C(
        "DEF 14A 2025 Proxy.pdf",
        18,
        "Steven B. Hedlund appointed CEO on November 8, 2023.",
        "The Board of Directors appointed Steven B. Hedlund as Chair, President and Chief Executive Officer effective November 8, 2023.",
        "10-K_page",
        "Item 10 — Directors & Executive Officers",
      ),
      C(
        "Insider screening service output 2026-05-07.json",
        null,
        "No officer or director matches the bank's insider register.",
        "{\"matches\": [], \"insider_match_confidence\": 0.0}",
        "service_output",
        "Reg O screening",
      ),
    ],
  },

  financial_analysis: {
    normalization_adjustments: [
      {
        period: "FY24",
        line_item: "EBITDA",
        original_value: 748_600_000,
        adjusted_value: 749_400_000,
        rationale:
          "Added back $0.8M of restructuring expense related to the wind-down of the Mexico City CO2 cylinder line. The charge is non-recurring and disclosed in 10-K Note 4.",
        citation: C(
          "LECO 10-K_2024.pdf",
          F(78),
          "$0.8M of FY24 restructuring expense related to discontinued operations is non-recurring.",
          "Restructuring charges of $0.8 million were recognized during 2024 in connection with the closure of the Mexico City facility...",
          "10-K_page",
          "Note 4 — Restructuring",
        ),
      },
      {
        period: "FY23",
        line_item: "EBITDA",
        original_value: 692_100_000,
        adjusted_value: 689_400_000,
        rationale:
          "Removed $2.7M one-time gain on sale of the company's former Singapore distribution warehouse (10-K Note 6).",
        citation: C(
          "LECO 10-K_2024.pdf",
          F(82),
          "$2.7M FY23 gain on sale of Singapore warehouse is non-recurring.",
          "During 2023, the Company recognized a pre-tax gain of $2.7 million from the sale of its former distribution warehouse located in Singapore.",
          "10-K_page",
          "Note 6 — Other Income",
        ),
      },
    ],
    trend_table: {
      periods: ["FY22", "FY23", "FY24"],
      rows: [
        {
          metric: "Revenue ($M)",
          values: [3380.5, 3870.0, 4007.4],
          trend: "+8.8% 2yr CAGR",
        },
        {
          metric: "Adjusted EBITDA ($M)",
          values: [612.0, 689.4, 749.4],
          trend: "+10.6% 2yr CAGR",
        },
        {
          metric: "EBITDA margin",
          values: ["18.1%", "17.8%", "18.7%"],
          trend: "+60 bps",
        },
        {
          metric: "Free cash flow ($M)",
          values: [380.0, 522.0, 487.5],
          trend: "+13.2% 2yr CAGR",
        },
        {
          metric: "Total debt ($M)",
          values: [762.0, 705.0, 685.4],
          trend: "−5.2% 2yr",
        },
        {
          metric: "Net leverage (Debt/EBITDA)",
          values: ["1.24x", "1.02x", "0.91x"],
          trend: "−33 bps",
        },
        {
          metric: "Cash & equivalents ($M)",
          values: [220.0, 408.0, 1210.0],
          trend: "+135% 2yr",
        },
        {
          metric: "Interest coverage (EBIT/Interest)",
          values: ["18.0x", "20.5x", "22.7x"],
          trend: "+470 bps",
        },
      ],
    },
    peer_comparison: {
      peer_set_id: "rma-naics-333992-fy24",
      naics_code: "333992",
      peer_count: 43,
      data_source: "RMA Annual Statement Studies FY24",
      rows: [
        {
          metric: "EBITDA margin",
          borrower: "18.7%",
          median: "12.2%",
          p25: "8.6%",
          p75: "14.8%",
          borrower_assessment: "Top decile",
        },
        {
          metric: "Net leverage (x)",
          borrower: "0.91x",
          median: "2.40x",
          p25: "1.50x",
          p75: "3.30x",
          borrower_assessment: "Top decile",
        },
        {
          metric: "Interest coverage (EBIT/I)",
          borrower: "22.7x",
          median: "6.1x",
          p25: "3.4x",
          p75: "10.2x",
          borrower_assessment: "Top decile",
        },
        {
          metric: "Current ratio",
          borrower: "1.94x",
          median: "1.85x",
          p25: "1.45x",
          p75: "2.30x",
          borrower_assessment: "Median",
        },
        {
          metric: "Days sales outstanding",
          borrower: "55d",
          median: "57d",
          p25: "48d",
          p75: "67d",
          borrower_assessment: "Median",
        },
        {
          metric: "ROIC",
          borrower: "21.8%",
          median: "10.4%",
          p25: "6.2%",
          p75: "14.0%",
          borrower_assessment: "Top decile",
        },
      ],
    },
    narrative:
      "Lincoln Electric's reported financials are clean. Two non-recurring items were normalized — a $0.8M FY24 restructuring add-back and a $2.7M FY23 gain on sale — each disclosed in the 10-K notes; the resulting adjustments to EBITDA are immaterial (<0.4%). Underlying financial performance has improved monotonically across all three measured fiscal years. Revenue grew from $3,380M in FY22 to $4,007M in FY24 (8.8% two-year CAGR), EBITDA margin expanded 60 bps to 18.7%, and net leverage compressed from 1.24x to 0.91x as the company de-leveraged $77M of senior notes while organically generating cash. Liquidity strengthened materially: cash and equivalents grew from $220M to $1,210M over the same period, with no scheduled maturities inside the proposed five-year tenor. Versus the RMA peer set (NAICS 333992, n=43), the borrower is in the top decile on EBITDA margin, leverage, interest coverage, and ROIC; the company sits at the median on working-capital metrics, which is consistent with its diversified end-market mix.",
    citations: [
      C(
        "LECO 10-K_2024.pdf",
        43,
        "FY22 revenue $3,380.5M; FY23 $3,870.0M; FY24 $4,007.4M.",
        "Net sales for the years ended December 31, 2022, 2023, and 2024 were $3,380.5, $3,870.0, and $4,007.4 million, respectively.",
        "10-K_page",
        "MD&A — Five-year selected data",
      ),
      C(
        "LECO 10-K_2024.pdf",
        F(60),
        "Cash and equivalents grew from $220M (12/31/22) to $1,210M (12/31/24).",
        "Cash and cash equivalents totaled $1,210.0 million as of December 31, 2024 (2023: $408.0 million; 2022: $220.0 million).",
        "10-K_page",
        "Balance Sheet",
      ),
      C(
        "RMA NAICS 333992 Annual Statement Studies FY24",
        12,
        "Borrower's 18.7% EBITDA margin places it in the top decile of the n=43 peer set (median 12.2%).",
        "EBITDA margin distribution for SIC 3548 / NAICS 333992 across 43 reporting entities — P25: 8.6%, Median: 12.2%, P75: 14.8%, P90: 17.4%.",
        "peer_table",
        "EBITDA margin distribution",
      ),
      C(
        "Financial-spreader service output 2026-05-07.json",
        null,
        "All FY22–FY24 figures spread from the audited 10-K and reconciled to within $0.1M.",
        "{\"reconciliation_delta_max\": 0.08, \"adjustments_applied\": 2}",
        "service_output",
        "Spread reconciliation",
      ),
    ],
  },

  cash_flow_projection: {
    assumptions: {
      revenue_cagr: 0.045,
      ebitda_margin: 0.180,
      capex_pct_revenue: 0.038,
      working_capital_days: { dso: 55, dpo: 38, inventory_days: 92 },
      narrative:
        "Base-case assumptions are a 4.5% revenue CAGR, 18.0% EBITDA margin, 3.8% capex/revenue, and steady-state working-capital days. These are conservative relative to the company's three-year actual run-rate and reflect a soft-landing macro view consistent with the OCC's 2026 supervisory baseline.",
    },
    scenarios: [
      {
        name: "base",
        label: "Base",
        revenue_cagr: 0.045,
        ebitda_margin: 0.180,
        rate_shock_bps: 0,
        year_3: {
          revenue_usd: 4_572_000_000,
          ebitda_usd: 822_960_000,
          annual_debt_service_usd: 40_400_000,
          dscr: 20.4,
          leverage: 0.83,
          covenant_headroom_dscr_pct: 1532.0,
        },
        interpretation:
          "Under the base case, DSCR exceeds the 1.25x covenant by a factor of 16, and leverage continues to compress.",
      },
      {
        name: "downside",
        label: "Downside (−200 bps margin)",
        revenue_cagr: 0.020,
        ebitda_margin: 0.160,
        rate_shock_bps: 0,
        year_3: {
          revenue_usd: 4_252_000_000,
          ebitda_usd: 680_320_000,
          annual_debt_service_usd: 40_400_000,
          dscr: 16.8,
          leverage: 1.01,
          covenant_headroom_dscr_pct: 1244.0,
        },
        interpretation:
          "Even with margin compression of 200 bps and revenue growth halved, headroom remains 12x and leverage stays comfortably below the 3.50x cap.",
      },
      {
        name: "recession",
        label: "Recession (−15% revenue)",
        revenue_cagr: -0.05,
        ebitda_margin: 0.140,
        rate_shock_bps: 0,
        year_3: {
          revenue_usd: 3_440_000_000,
          ebitda_usd: 481_600_000,
          annual_debt_service_usd: 40_400_000,
          dscr: 11.9,
          leverage: 1.42,
          covenant_headroom_dscr_pct: 852.0,
        },
        interpretation:
          "A peak-to-trough revenue decline comparable to 2008–2009 (when LECO revenue fell 27% over two years) would still leave DSCR at 11.9x and headroom of 852% above the covenant floor.",
      },
      {
        name: "recession_plus_200bps",
        label: "Recession + 200 bps rate shock",
        revenue_cagr: -0.05,
        ebitda_margin: 0.140,
        rate_shock_bps: 200,
        year_3: {
          revenue_usd: 3_440_000_000,
          ebitda_usd: 481_600_000,
          annual_debt_service_usd: 53_400_000,
          dscr: 9.0,
          leverage: 1.42,
          covenant_headroom_dscr_pct: 620.0,
        },
        interpretation:
          "The combined recession + rate shock — the supervisory severely-adverse posture — still produces DSCR of 9.0x. The covenant package is effectively unbreachable on this borrower under any plausible stress.",
      },
    ],
    narrative:
      "We modeled a base case, a 200 bps margin downside, a recession case calibrated to LECO's 2008–2009 trough (peak-to-trough revenue −27%), and a combined recession + 200 bps rate shock. DSCR remains above 9.0x in every scenario; leverage never exceeds 1.42x against the proposed 3.50x cap. The proposed credit is structurally over-collateralized by cash flow.",
    citations: [
      C(
        "LECO 10-K_2009.pdf",
        12,
        "Peak-to-trough FY08–FY09 revenue decline was 27%.",
        "Net sales decreased to $1,729.7 million in 2009 from $2,374.3 million in 2008, a decline of 27.2%, driven by the global recession in industrial markets.",
        "10-K_page",
        "MD&A — 2009 Results",
      ),
      C(
        "OCC Supervisory Baseline 2026.pdf",
        4,
        "OCC 2026 baseline projects 2.1% real GDP and stable Fed funds.",
        "The Comptroller's 2026 baseline scenario projects 2.1% real GDP growth and a Fed funds policy rate held at 4.25%–4.50% through year-end.",
        "regulation",
        "Macro baseline",
      ),
      C(
        "DSCR-calculator service output 2026-05-07.json",
        null,
        "DSCR remains above 1.25x covenant in every modeled scenario.",
        "{\"min_dscr_across_scenarios\": 9.0, \"covenant_floor\": 1.25}",
        "service_output",
        "DSCR matrix",
      ),
    ],
  },

  risk_factors: {
    factors: [
      {
        name: "Cyclical end-market exposure",
        severity_1_10: 5,
        evidence:
          "Roughly 35% of FY24 revenue is tied to general fabrication and heavy industry, which historically declines 20–30% peak-to-trough during industrial recessions. During FY09 the company saw revenue fall 27% from FY08 levels.",
        mitigation:
          "EBITDA margin remained positive (8.4%) at the FY09 trough, and the company generated $208M of operating cash flow that year. The base-case credit metrics absorb a comparable shock with DSCR remaining at 11.9x.",
        citations: [
          C(
            "LECO 10-K_2009.pdf",
            14,
            "FY09 operating cash flow of $208M was sufficient to cover all interest and capex.",
            "Cash provided by operating activities was $208.4 million for the year ended December 31, 2009...",
            "10-K_page",
            "Cash flow statement",
          ),
          C(
            "Industry-risk-scorer output 2026-05-07.json",
            null,
            "NAICS 333992 industry-risk score of 4/10 (moderate).",
            "{\"naics\": \"333992\", \"score\": 4, \"factors\": [\"cyclical_end_markets\", \"input_cost_volatility\"]}",
            "service_output",
            "Industry risk score",
          ),
        ],
      },
      {
        name: "Steel input-cost volatility",
        severity_1_10: 4,
        evidence:
          "Steel rod and coil represent ~38% of cost-of-goods sold. The HRC steel index moved 280% from May 2020 to August 2021 and the company reported a 320 bps margin compression during the H2-21/H1-22 period.",
        mitigation:
          "Pricing surcharges are contractual on ~62% of revenue and reset quarterly. The company holds 92 days of inventory which provides a natural roll-forward hedge. EBITDA margins recovered to 18.7% by FY24.",
        citations: [
          C(
            "LECO 10-K_2024.pdf",
            33,
            "Pricing surcharges cover 62% of FY24 revenue.",
            "Approximately 62% of our 2024 net sales are subject to contractual pricing surcharges that reset on a calendar-quarter basis to reflect changes in steel rod and coil indices.",
            "10-K_page",
            "Item 7A — Commodity Risk",
          ),
          C(
            "LECO 10-Q_Q2-2022.pdf",
            18,
            "Margin compression of 320 bps in H1-22 vs H2-21 due to steel cost lag.",
            "Adjusted operating margin declined 320 basis points to 13.2% in the first half of 2022 compared to the prior comparable period, primarily due to the lag effect of steel cost pass-through.",
            "10-Q_page",
            "MD&A — Margin commentary",
          ),
        ],
      },
      {
        name: "Customer concentration in automotive segment",
        severity_1_10: 3,
        evidence:
          "Automotive OEMs and Tier-1 suppliers represent ~14% of FY24 revenue. The largest customer (Tesla, Inc.) accounted for 8.2% of revenue in FY24 — within the 10% disclosure threshold but trending up from 6.1% in FY22.",
        mitigation:
          "Customer concentration HHI of 412 is one-third the RMA NAICS 333992 peer median (1,180). The Tesla relationship spans multiple plants and welding-automation product lines, reducing the impact of any single-program loss.",
        citations: [
          C(
            "LECO 10-K_2024.pdf",
            F(50),
            "Tesla, Inc. accounted for 8.2% of FY24 revenue.",
            "In 2024, our largest customer, Tesla, Inc., accounted for approximately 8.2% of consolidated net sales.",
            "10-K_page",
            "MD&A — Concentration of credit risk",
          ),
          C(
            "Peer-benchmarker service output 2026-05-07.json",
            null,
            "Customer-concentration HHI of 412 is in the lowest-concentration quartile of the peer set.",
            "{\"hhi\": 412, \"peer_median_hhi\": 1180, \"percentile\": 25}",
            "peer_table",
            "Concentration percentile",
          ),
        ],
      },
      {
        name: "International FX translation risk",
        severity_1_10: 4,
        evidence:
          "Approximately 43% of FY24 revenue is non-USD. The euro and Brazilian real together account for 26% of non-USD revenue. A 10% USD strengthening would compress reported revenue by ~$170M.",
        mitigation:
          "The company hedges ~60% of forward FX exposure on a rolling 12-month basis. Underlying margin is preserved on a constant-currency basis. EBITDA contribution is more diversified geographically than the revenue line implies.",
        citations: [
          C(
            "LECO 10-K_2024.pdf",
            F(34),
            "43% of FY24 revenue is non-USD denominated.",
            "Approximately 43% of our consolidated 2024 net sales were generated in currencies other than the U.S. dollar...",
            "10-K_page",
            "Item 7A — FX Risk",
          ),
        ],
      },
      {
        name: "ESG / climate transition exposure (welding to oil & gas pipelines)",
        severity_1_10: 3,
        evidence:
          "Energy infrastructure (including oil & gas pipeline welding) represents ~12% of FY24 revenue. Long-term hydrogen and renewable-power infrastructure is expected to substitute, but the timing is uncertain.",
        mitigation:
          "The company has invested $148M in the last three years in automation and additive-manufacturing capabilities targeting hydrogen pipelines, EV battery enclosures, and offshore wind nacelles — segments expected to grow at >10% CAGR through 2030.",
        citations: [
          C(
            "LECO 10-K_2024.pdf",
            F(28),
            "$148M cumulative R&D and capex on automation/additive manufacturing FY22–FY24.",
            "Research and development plus targeted capital expenditure on automation and additive-manufacturing platforms totaled $148 million across the three-year period 2022–2024.",
            "10-K_page",
            "Item 7 — Strategy",
          ),
          C(
            "Industry-risk-scorer output 2026-05-07.json",
            null,
            "Climate-transition score: medium-low (3/10) given diversified end-market mix.",
            "{\"climate_transition_score\": 3, \"hydrogen_exposure\": \"growth_aligned\"}",
            "service_output",
            "ESG transition",
          ),
        ],
      },
    ],
  },

  collateral: {
    items: [
      {
        type: "other",
        description:
          "Senior unsecured guaranty from The Lincoln Electric Company (operating subsidiary).",
        appraised_value_usd: 0,
        haircut_pct: 1.0,
        lendable_value_usd: 0,
        lien_position: "first",
        regulation: "12 CFR 32.3(c)",
        citation: C(
          "LECO Credit Agreement Draft 2026-04-22.pdf",
          7,
          "Operating subsidiary will provide an unconditional senior guaranty.",
          "The Lincoln Electric Company shall enter into a Subsidiary Guaranty in favor of the Lender on a senior unsecured basis...",
          "internal_policy",
          "Credit agreement §3.1",
        ),
      },
    ],
    total_pledged_usd: 0,
    loan_amount_usd: 25_000_000,
    coverage_pct: 0.0,
    narrative:
      "The proposed facility is senior unsecured. Lincoln Electric is rated Baa1 (Moody's) / BBB+ (S&P) / A− (Fitch); both rating agencies cite the company's investment-grade balance sheet and twelve consecutive years of positive free cash flow as the basis for the unsecured posture. The bank's existing $72M of utilised exposure with the borrower is also unsecured. A senior guaranty from the operating subsidiary (The Lincoln Electric Company) is being put in place to harmonise with the company's senior-note indenture.",
  },

  covenant_package: {
    maintenance_covenants: [
      {
        name: "DSCR_floor",
        threshold: 1.25,
        threshold_unit: "x",
        test_frequency: "quarterly",
        grace_period_days: 30,
        headroom_pct_at_base: 1532.0,
        rationale:
          "Standard 1.25x floor consistent with the bank's investment-grade middle-market book. Headroom of 1,532% at base case.",
      },
      {
        name: "leverage_cap",
        threshold: 3.5,
        threshold_unit: "x",
        test_frequency: "quarterly",
        grace_period_days: 30,
        headroom_pct_at_base: 285.0,
        rationale:
          "3.50x net-leverage cap aligns with the borrower's senior-note indenture and provides room for tactical M&A within the base case.",
      },
      {
        name: "minimum_liquidity",
        threshold: 250_000_000,
        threshold_unit: "usd",
        test_frequency: "quarterly",
        grace_period_days: 15,
        headroom_pct_at_base: 384.0,
        rationale:
          "Minimum liquidity (cash + revolver availability) of $250M ensures the company retains capacity to absorb a 2008-style cash drawdown. Headroom 384% at base.",
      },
    ],
    incurrence_covenants: [
      {
        name: "M&A consent",
        applies_when: "Any single transaction or related series exceeding $400M",
        threshold: "$400M",
      },
      {
        name: "Dividend restriction",
        applies_when: "Pro-forma leverage post-dividend exceeds 3.00x",
        threshold: "3.00x",
      },
      {
        name: "Negative pledge",
        applies_when:
          "Existing senior-note indenture covenant — bank to be ratably secured if any future debt is collateralized",
        threshold: null,
      },
    ],
    reporting_cadence:
      "Quarterly compliance certificate within 45 days of fiscal quarter-end; audited annual financials within 90 days of fiscal year-end; immediate notice of any rating-agency action.",
    narrative:
      "Covenants mirror the senior-note indenture and the bank's investment-grade middle-market template. Maintenance covenants are tested quarterly with a 30-day grace period. Headroom at the base case ranges from 285% (leverage cap) to 1,532% (DSCR floor), and remains positive through every modeled stress.",
    citations: [
      C(
        "Bank Credit Policy v6.2.pdf",
        14,
        "Investment-grade middle-market template prescribes 1.25x DSCR / 3.50x leverage / $250M liquidity.",
        "Section 4.3 — investment-grade public obligor template: DSCR 1.25x, net leverage 3.50x, minimum liquidity sized to 90 days of operating expense.",
        "internal_policy",
        "Credit policy template",
      ),
      C(
        "LECO Senior Note Indenture 2024.pdf",
        24,
        "Senior-note indenture imposes a 3.50x net-leverage cap and a negative-pledge clause.",
        "Section 4.07 — Net Consolidated Leverage Ratio shall not exceed 3.50 to 1.00 as of any test date...",
        "internal_policy",
        "Indenture §4.07",
      ),
    ],
  },

  regulatory_concentration: {
    single_borrower_limit: {
      total_exposure_usd: 97_000_000,
      tier1_capital_usd: 1_308_000_000,
      exposure_pct: 0.074,
      cap_pct: 0.10,
      compliant: true,
      regulation: "12 CFR 32.3",
    },
    reg_o_check: {
      is_insider: false,
      related_to: null,
      insider_match_confidence: 0.0,
      board_approval_required: false,
      estimated_board_meeting: null,
      regulation: "12 CFR 215.5",
    },
    appraisal_check: {
      required: false,
      regulation: "12 CFR 34.43",
      rationale:
        "Facility is senior unsecured with no real-estate collateral; the appraisal regulation is not triggered.",
    },
    fair_lending: {
      pricing_within_band: true,
      delta_bps_vs_peers: -8,
      regulation: "Reg B / ECOA",
    },
    bsa_aml_ofac: {
      ofac_clear: true,
      kyc_complete: true,
      screening_notes:
        "Borrower screened against OFAC SDN, EU Consolidated, UK HMT, and the bank's internal blocklists on 2026-05-06; no hits. KYC file refreshed 2026-04-29.",
    },
    citations: [
      C(
        "Exposure-aggregator service output 2026-05-07.json",
        null,
        "Total post-funding exposure to LECO and affiliates is $97.0M.",
        "{\"borrower\":\"LECO-001\",\"existing_utilized\":72000000,\"proposed\":25000000,\"total\":97000000}",
        "service_output",
        "Aggregate exposure",
      ),
      C(
        "Bank Tier 1 Capital Snapshot 2026-04-30.pdf",
        1,
        "Tier 1 capital of $1,308M was reported on the April 30, 2026 capital snapshot.",
        "Common Equity Tier 1: $1,308.0M as of April 30, 2026.",
        "internal_policy",
        "Capital snapshot",
      ),
      C(
        "Insider screening service output 2026-05-07.json",
        null,
        "No officer or director matches the bank's insider register.",
        "{\"matches\":[],\"insider_match_confidence\":0.0}",
        "service_output",
        "Reg O",
      ),
      C(
        "12 CFR 34.43",
        null,
        "Appraisal regulation applies to real-estate-secured loans; not triggered here.",
        "An appraisal is required for any federally related transaction in excess of the de minimis threshold...",
        "regulation",
      ),
      C(
        "Pricing-band peer table 2026-05.pdf",
        3,
        "Proposed pricing of SOFR + 165 bps is 8 bps inside the BBB+/BBB middle-market 5-year band.",
        "Median syndicated 5-year term-loan spread for BBB+/BBB obligors over the trailing 90 days: SOFR + 173 bps (n=18).",
        "peer_table",
        "Pricing band",
      ),
      C(
        "OFAC screening service output 2026-05-06.json",
        null,
        "OFAC SDN, EU Consolidated, UK HMT, and internal blocklist screening cleared on 2026-05-06.",
        "{\"ofac_clear\": true, \"hits\": [], \"sources\": [\"OFAC_SDN\", \"EU_CONS\", \"UK_HMT\", \"INTERNAL\"]}",
        "service_output",
        "Sanctions screening",
      ),
    ],
  },

  risk_rating_rationale: {
    risk_band: "1-pass",
    drivers: [
      {
        factor: "Leverage",
        assessment: "strong",
        evidence:
          "Net leverage 0.91x at FY24 year-end, top-decile vs RMA NAICS 333992 peer median of 2.40x.",
        citation: C(
          "LECO 10-K_2024.pdf",
          43,
          "Net leverage 0.91x at 12/31/24.",
          "Net debt of $685.4M against adjusted EBITDA of $749.4M = net leverage of 0.91x.",
          "10-K_page",
          "MD&A — Capital structure",
        ),
      },
      {
        factor: "DSCR",
        assessment: "strong",
        evidence:
          "Base-case DSCR 20.4x. Recession + rate-shock DSCR 9.0x. Covenant floor of 1.25x is unbreachable under any plausible stress.",
        citation: C(
          "DSCR-calculator service output 2026-05-07.json",
          null,
          "Minimum DSCR across modeled scenarios: 9.0x.",
          "{\"min_dscr_across_scenarios\":9.0,\"covenant_floor\":1.25}",
          "service_output",
          "Stress matrix",
        ),
      },
      {
        factor: "Liquidity",
        assessment: "strong",
        evidence:
          "$1.21B of cash on hand at FY24 year-end and an undrawn $500M revolver provide $1.71B of liquidity against the $25M proposed facility — coverage of 68x.",
        citation: C(
          "LECO 10-K_2024.pdf",
          F(60),
          "Cash $1,210M and undrawn revolver $500M at 12/31/24.",
          "The Company maintained $1,210.0 million of cash and short-term investments at year-end and had no borrowings against its $500 million revolving credit facility.",
          "10-K_page",
          "Balance Sheet",
        ),
      },
      {
        factor: "Management & governance",
        assessment: "strong",
        evidence:
          "CEO tenure 20+ years at the company; CFO tenure 27 years. The Board is fully independent except for the CEO. ISS QualityScore is 1 (strongest decile) on Audit & Risk Oversight.",
        citation: C(
          "DEF 14A 2025 Proxy.pdf",
          22,
          "ISS QualityScore of 1 (top decile) on Audit & Risk Oversight.",
          "Institutional Shareholder Services QualityScore as of January 1, 2025: Audit & Risk Oversight = 1; Compensation = 2; Board Structure = 1.",
          "10-K_page",
          "Governance",
        ),
      },
      {
        factor: "Customer concentration",
        assessment: "adequate",
        evidence:
          "Top customer 8.2% of revenue, but trending up from 6.1% in FY22. Aggregate top-5 24.3%; HHI 412.",
        citation: C(
          "LECO 10-K_2024.pdf",
          F(50),
          "Top-customer share trended from 6.1% in FY22 to 8.2% in FY24.",
          "The largest customer accounted for 6.1% of net sales in 2022, 7.4% in 2023, and 8.2% in 2024.",
          "10-K_page",
          "Customer concentration",
        ),
      },
    ],
    identified_weaknesses: [
      {
        weakness:
          "Top-customer concentration trending higher (Tesla program ramp).",
        mitigation:
          "Monitor quarterly via the bank's industry-monitoring service. Re-test at any 100 bps move in the top-customer share.",
      },
      {
        weakness:
          "Steel input-cost lag introduces 1–2 quarter margin volatility.",
        mitigation:
          "Quarterly compliance certificate gives early visibility; the leverage cap is set at 3.50x to absorb a 2-quarter margin shock without breach.",
      },
    ],
    occ_handbook_citation: "OCC Comptroller's Handbook: Rating Credit Risk (June 2024)",
    narrative:
      "All five rating drivers are assessed strong or adequate. The Pass (1) rating reflects an investment-grade balance sheet, top-decile peer-relative profitability, an unbreachable covenant package, and fully cleared regulatory screens. The two identified weaknesses are mitigated through ongoing monitoring rather than structural conditions.",
  },

  recommendation: {
    action: "approve",
    approval_authority: "senior_credit_officer",
    terms: {
      amount_usd: 25_000_000,
      rate: "SOFR + 165 bps · five-year fixed via swap (effective ~10.05% all-in at the May 2026 SOFR forward)",
      term_years: 5,
      amortization_years: null,
      balloon_at_maturity: true,
      origination_fee_pct: 0.0025,
      annual_fee_bps: 15,
      prepayment:
        "Prepayable at par on any quarter-end with 30 days' written notice; SOFR breakage on the swap will be passed through.",
      draws:
        "Single draw at closing; revolving feature is not provided under this facility.",
    },
    conditions_precedent: [
      "Execution of the Credit Agreement and Subsidiary Guaranty in form and substance acceptable to the bank.",
      "Delivery of audited FY24 financials and the Q1-26 compliance certificate (already received and reviewed).",
      "Confirmation of Tier 1 capital position via the April 30, 2026 capital snapshot (received).",
      "Negative-pledge release from the existing senior-note trustee to permit the new unsecured facility to rank pari passu.",
      "OFAC re-screen at funding date and the borrower's certification of no material change.",
      "Customary legal opinions from external counsel covering corporate authority, due execution, and enforceability.",
    ],
    narrative:
      "Underwriting recommends APPROVE at a Pass (1) risk rating, on the terms summarized above. The proposal sits comfortably within the bank's single-borrower limit, the borrower is fully cleared on Reg O, BSA/AML/OFAC, and fair-lending, and the proposed pricing is 8 bps inside the BBB+/BBB middle-market 5-year band. Approval authority resides with the Senior Credit Officer per the bank's delegation matrix; no committee action is required.",
  },
};

// helpers --------------------------------------------------------------

/** Force a number to int — used because some 10-K page numbers are stable
 *  across editions but our typecheck is picky about literals vs numbers. */
function F(n: number): number {
  return n | 0;
}
