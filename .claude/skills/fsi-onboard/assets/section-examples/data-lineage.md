# Section example — data sources / lineage

Below is how credit-memo-commercial filled its data section.

## Data sources (real example)

| Source | System | Refresh | Owner | Access | Quality issues | PII |
|---|---|---|---|---|---|---|
| borrower_master | Cloud SQL `borrower_master` | daily | credit-data-team | sql | EIN sometimes blank for newly onboarded; we backfill from CSC | tin, ssn (insider individuals only) |
| 10-K filings | GCS bucket `loan-docs/` | on-demand at intake | data-engineering | file-drop | scanned 10-Ks fail extraction ~12% of the time → Landing AI fallback | none (public filings) |
| AR aging | FIS Profile loan servicing platform | weekly | servicing-it | rest-api | bucket boundaries differ from bank policy (vendor uses 31/61/91; we use 30/60/90) | account_numbers |
| Industry context | Moody's Analytics REST API | daily | credit-data-team | rest-api | rate-limited at 1000 req/day; cache for 24h | none |
| Borrower covenants | Cloud SQL `loan_facilities` | real-time | servicing-it | sql | historical covenant breaches inconsistently flagged before 2024-Q3 | none |
| Reg O insider master | Cloud SQL `insiders` | daily | corporate-secretary | sql | quarterly reconciliation against board minutes | individual names, ssn, addresses |

## Freshness SLAs (real example)

- borrower_master: stale > 24h triggers a memo annotation
- AR aging: stale > 8 days fails the underwriting gate
- Reg O insider master: stale > 24h fails the Reg O pre-check entirely

## What "good" looks like

- Every source has an owner team. If you can't name the team, you don't really know if you can rely on it.
- Refresh cadence is concrete. "Daily" is fine; "frequently" is not.
- Quality issues are documented up front — they will show up in production whether you wrote them down or not.
- PII fields are named. The compliance-reviewer and security-reviewer agents will check this against the masking/encryption policy.
