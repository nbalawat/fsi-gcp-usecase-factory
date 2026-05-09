# Demo scenarios — hero documents and source attribution

This file documents the source documents used in the demo, where they came from,
and what excerpts are bundled into the repo.

## Lincoln Electric Holdings, Inc. — `BRW-LECO`

The "hero" head-turner scenario for the credit-memo-commercial pipeline. A real
public-company 10-K is dragged into the document upload zone on the homepage;
the system extracts financials, builds a synthetic loan application payload,
publishes to Pub/Sub, and the underwriter watches the case progress through the
five-step pipeline.

### Source filing

- Issuer: **Lincoln Electric Holdings, Inc.** (NYSE: LECO)
- CIK: `0000059527`
- Form type: **10-K** (annual report)
- Period of report: **fiscal year ended December 31, 2025**
- Accession number: `0000059527-26-000006`
- Filing date: 2026-02-19 (filed with the U.S. Securities and Exchange
  Commission via EDGAR)
- Index page: <https://www.sec.gov/Archives/edgar/data/59527/000005952726000006/0000059527-26-000006-index.htm>
- Primary document (iXBRL HTML, ~4 MB):
  <https://www.sec.gov/Archives/edgar/data/59527/000005952726000006/leco-20251231x10k.htm>

### What's bundled in the repo

```
usecases/credit-memo-commercial/demo-data/hero/
  leco_10k_excerpt.txt        # plain-text excerpt of MD&A (Item 7) + selected
                              # consolidated financial statements (Item 8)
  leco_10k_excerpt.pdf        # 11-page PDF rendering of the same excerpt;
                              # this is the file the demo user drags into the
                              # dropzone on the homepage. pdf-parse extracts
                              # text from it on the server.
```

The excerpt is intentionally short (~20 KB of text, 11 PDF pages) so it ships
in the repo without bloating clones. It captures:

- The MD&A `Results of Operations` table (Net sales 2025 vs 2024, gross
  profit, operating income, net income).
- The Net Sales bridge (volume, price, acquisitions, FX).
- The opening of the Consolidated Statements of Income.

Demo viewers who want to see the full 10-K can follow the SEC EDGAR URL in the
generated credit memo's citation popovers.

### Fair-use note

The 10-K is a public filing made by the issuer with the SEC pursuant to
Section 13 of the Securities Exchange Act of 1934. SEC filings are in the
public domain. The excerpt is included for non-commercial demonstration of the
agentic banking platform — specifically, to show that the system can ingest a
real, recognizable corporate filing and produce a defensible credit memo. No
endorsement by Lincoln Electric is implied; the synthetic loan application
("$25M term facility, refinance + automation capex") is fictional and is
constructed by the demo only to exercise the pipeline.

If your demo runs in a setting where redistributing the excerpt is undesirable
(for example, an external customer environment), replace the PDF with a
placeholder and ship only the URL — the system can fetch from EDGAR at runtime
when network is available.

### Synthetic loan application

The fixture at `scripts/demo_fixtures/BRW-LECO.json` constructs the payload the
handler expects. Numbers are calibrated to the real 10-K so the credit memo's
DSCR, leverage, and peer-percentile claims match what an analyst would see if
they spread the actual statements:

| Metric (FY2025) | Value | Source |
|---|---|---|
| Net sales | $4,233,003 thousand | 10-K MD&A `Results of Operations` |
| Cost of goods sold | $2,698,751 thousand | 10-K MD&A `Results of Operations` |
| Operating income | $718,059 thousand | 10-K MD&A `Results of Operations` |
| Net income | $520,533 thousand | 10-K MD&A `Results of Operations` |
| Interest expense, net | $51,561 thousand | 10-K MD&A `Results of Operations` |
| Effective tax rate | 22.9% | 10-K MD&A `Results of Operations` |
| Diluted EPS | $9.32 | 10-K MD&A `Results of Operations` |

EBITDA, capex, depreciation, and the FY2023 historicals in the fixture are
banker estimates (the 10-K does not publish EBITDA as a GAAP measure); they
sit close to consensus for the metalworking-machinery peer set.

### Refreshing the excerpt

When LECO files a fresh 10-K, regenerate by:

1. Run a `curl` against the SEC EDGAR filings page for CIK 0000059527 to find
   the new accession number.
2. Download the primary HTML document.
3. Extract the MD&A + financial-statement text.
4. Re-render to PDF (any tool that accepts plain text — `reportlab`,
   `weasyprint`, `wkhtmltopdf`).
5. Update the numbers in `scripts/demo_fixtures/BRW-LECO.json` to match the
   new fiscal year.
6. Update the period-of-report and accession number in this file.

Always include the SEC `User-Agent` (an email contact) when fetching from
`www.sec.gov`; the SEC blocks anonymous bots.
