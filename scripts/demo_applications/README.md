# Demo applications — 5 borrower folders for full-lifecycle testing

Each folder is a complete loan application: a `metadata.json` + a
`documents.json` manifest + PDFs in `files/`. The `upload_all.sh`
script POSTs each to `/api/applications` and reports the case URLs.

## Provenance

The PDFs in this directory are derived from **Berkshire Hathaway's
public 2023 annual report** (3MB, downloaded from
berkshirehathaway.com/2023ar/2023ar.pdf — public, free to redistribute
for testing). We slice the 152-page document into seven distinct
sections and label each as a different `doc_type` to give each demo
application a realistic mix of source documents.

The borrower identities (Midcap Manufacturing, Riverside Real Estate,
etc.) are **fictional**. Landing AI ADE will extract real Berkshire
financial figures (revenue $364B, net income $96B, etc.); the memo will
read those values under the fictional borrower name. This is fine for
exercising the lifecycle — the data flows are real; the labels are
synthetic.

## The 5 scenarios

| Folder | Loan | Docs | Expected outcome |
|---|---:|---|---|
| `BRW-BERKSHIRE-2024` | $25M | 10-K + AR_aging | APPROVE — happy path, sub-$50M tier |
| `BRW-MIDCAP-MFG` | $5M | audited_financials | APPROVE — sub-$10M tier, single-doc minimum |
| `BRW-LARGE-CAP` | $250M | 10-K + 10-Q + AR_aging + board_minutes | APPROVE or DECLINE — full $200M+ doc set |
| `BRW-RE-SECURED` | $50M | 10-K + AR_aging + appraisal | APPROVE — real-estate collateral, 12 CFR 34 |
| `BRW-DEFICIENT-RETURN` | $25M | chairman letter only (deficient) | RETURN_FOR_REVISION — validation gate fires |

## Run

```
# Upload all 5
bash scripts/demo_applications/upload_all.sh

# Upload one
bash scripts/demo_applications/upload_all.sh BRW-BERKSHIRE-2024

# Against a non-local UI (e.g. staging dev URL)
UI_BASE_URL=https://pipeline-console.example.com \
  bash scripts/demo_applications/upload_all.sh
```

Each upload prints the case URL — open it to watch the workflow run.

## What you should see in the UI

For all 5 cases, navigate to `/cases/<application_id>`:

- **Per-document panel** at the top — one card per uploaded doc with
  doc_type pill, extraction status (pending → extracting → extracted),
  page count, confidence band, and an inline extracted-fields table
  with citation-back-to-page badges.

- **Spreading panel** below (for non-deficient cases) — three-column
  view: raw extracted line items per source doc | normalized values
  post-spreader | adjustments with rationale. Plus a strip of computed
  ratios (DSCR, leverage, current ratio, ICR) with quality bands.

- **Memo body** below the spreading — the 10-section credit memo,
  populated by the `drafter` agent after the upstream `analyst` and
  `rater` produce their structured outputs.

For `BRW-DEFICIENT-RETURN`:
- The memo region is replaced by **`ReturnedApplicationPanel`** showing
  the actionable checklist: what's missing, why, and what the
  applicant must re-submit.

## Adding a new scenario

1. `mkdir scripts/demo_applications/BRW-<NAME>/files/`
2. Write `metadata.json` (borrower_id, name, loan_amount_usd, NAICS,
   facility_type, term_years, scenario_tag).
3. Write `documents.json` — array of `{field: "file_N", doc_type, filename}`.
4. Drop the PDFs into `files/`.
5. `bash scripts/demo_applications/upload_all.sh BRW-<NAME>`.
