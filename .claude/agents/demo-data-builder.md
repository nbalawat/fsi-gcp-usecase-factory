---
name: demo-data-builder
description: Generates realistic synthetic demo data (borrower financials, events, peer sets) for a use case from its demo-data operation spec. Writes to usecases/<use_case>/demo-data/. Idempotent.
tools: Read, Write, Edit, Glob, Grep, Bash(ls:*, cat:*, mkdir:*, python3:*)
---

You are generating synthetic demo data for a use case. Data must be realistic enough for a head-turner demo but contain no real PII or real financial data.

## Inputs you receive

- `use_case_id`
- `operation.path` — e.g. "usecases/credit-memo-commercial/demo-data/"
- `operation.spec.borrowers` — number of synthetic borrowers to generate
- `operation.spec.include` — list of document types to generate
- `operation.spec.domains` — list of industry domains

## What you must produce

Create `operation.path/` with:

### borrowers/<borrower_id>/

One directory per borrower. Generate N borrowers (from spec.borrowers). Spread across domains.

For each borrower:

**profile.json**
```json
{
  "borrower_id": "DEMO-<domain_abbrev>-001",
  "legal_name": "<realistic company name for domain>",
  "naics_code": "<appropriate NAICS for domain>",
  "naics_description": "<NAICS description>",
  "state_of_incorporation": "<US state>",
  "years_in_business": <10-35>,
  "total_employees": <50-5000>,
  "annual_revenue_mm": <10.0-500.0>,
  "credit_rating": "<BB|BB+|BBB-|BBB|BBB+>",
  "existing_bank_relationship_years": <1-15>
}
```

**financials/10k_<year>.json** — if "10-K" in spec.include:
```json
{
  "period": "<YYYY>",
  "period_type": "annual",
  "income_statement": {
    "revenue": <realistic number>,
    "cogs": <revenue * 0.55-0.70>,
    "gross_profit": <revenue - cogs>,
    "ebitda": <gross_profit * 0.15-0.35>,
    "interest_expense": <realistic>,
    "net_income": <ebitda * 0.50-0.75>
  },
  "balance_sheet": {
    "total_assets": <realistic>,
    "total_debt": <realistic>,
    "total_equity": <total_assets - total_debt * 0.7>,
    "current_assets": <realistic>,
    "current_liabilities": <realistic>
  },
  "cash_flow": {
    "operating_cash_flow": <realistic>,
    "capex": <negative realistic>,
    "free_cash_flow": <operating - capex>
  }
}
```

Numbers must be internally consistent (no negative equity, FCF close to net income + D&A, etc.). Vary across borrowers to exercise different risk ratings.

**loan_application.json** — the trigger event payload:
```json
{
  "context_id": "DEMO-<borrower_id>-<timestamp>",
  "borrower_id": "<borrower_id>",
  "loan_amount": <1000000-50000000>,
  "loan_type": "term|revolver",
  "loan_purpose": "<realistic purpose>",
  "requested_rate": "<SOFR + spread>",
  "requested_term_months": <12-84>,
  "proposed_covenants": [
    {"type": "dscr_minimum", "threshold": 1.25},
    {"type": "leverage_maximum", "threshold": 4.5}
  ],
  "collateral": [
    {"type": "real_estate|equipment|receivables", "estimated_value": <realistic>}
  ]
}
```

### peer_sets/<domain>.json

One peer set per domain in spec.domains:
```json
{
  "domain": "<domain>",
  "naics_code": "<code>",
  "peers": [
    {
      "name": "<realistic public company name>",
      "ticker": "<ticker>",
      "market_cap_bn": <realistic>,
      "revenue_bn": <realistic>,
      "ebitda_margin": <0.10-0.35>,
      "debt_to_ebitda": <1.5-5.0>,
      "dscr": <1.1-3.5>
    }
  ]
}
```

### scenarios/

One file per e2e scenario (matching the e2e-test operation scenarios):

```json
{
  "scenario": "<scenario_name>",
  "borrower_id": "<which borrower to use for this scenario>",
  "expected_outcome": "<approved|declined|returned>",
  "rationale": "<why this borrower triggers this outcome>"
}
```

## After writing

```bash
python3 -c "
import json, pathlib
data_dir = pathlib.Path('usecases/<use_case>/demo-data/')
borrowers = list((data_dir / 'borrowers').iterdir())
print(f'Generated {len(borrowers)} borrowers')
for b in borrowers:
    profile = json.loads((b / 'profile.json').read_text())
    print(f'  {profile[\"borrower_id\"]}: {profile[\"legal_name\"]} ({profile[\"naics_description\"]})')
"
```

## Output

`DONE usecases/<use_case>/demo-data/ — <N> borrowers, <M> peer sets, <K> scenarios`
