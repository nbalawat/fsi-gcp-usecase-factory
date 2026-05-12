# Section example — compliance citations

Below is how credit-memo-commercial captured its regulatory citations.
Validation that each citation is correctly applied is deferred to the
compliance-reviewer subagent; intake just captures the keys.

## Citations (real example)

- `OCC §32.3` — single-borrower limits; rule `single_borrower_limit_check` enforces
- `Reg O §215.4` — insider transactions; rule `reg_o_insider_check` flags + workflow routes through executive committee
- `SR 11-7` — model risk management; applies to all quantitative models (rater, DSCR-calculator), drives model-card requirements
- `12 CFR §1024` — RESPA disclosures; doesn't apply at origination time but flagged so the downstream servicing UC knows
- `Fair Lending / ECOA / Reg B` — fair-lending compliance; drives the audit trail completeness requirement (decision reasons must be traceable)
- `BSA / 31 CFR §1020` — KYC at origination; rule `bsa_kyc_check` validates against insider + watchlist

## Auditor focus areas

- "Show me the decision chain for case X" — needs full event log
- "Why was this risk band assigned" — needs the rater's rationale + citations
- "Has the model been validated this year" — needs the model card + last-validated date
- "Are insiders treated under Reg O" — needs the insider-check rule firing + audit trail

## What "good" looks like

- Citation keys are precise — "Reg O §215.4" not "Reg O" — so the compliance-reviewer can resolve to the exact CFR section.
- Each citation has a note saying HOW the UC complies (which rule, agent, or sink enforces it).
- Auditor focus areas are written from the auditor's perspective, not the engineer's. "Show me X" is what they'll ask in an exam.
- If you're not sure whether a regulation applies, list it anyway with a `pending_review` note. The compliance-reviewer will adjudicate.

## What NOT to do

- Don't list every reg in the CFR "just to be safe" — the compliance-reviewer treats unused citations as noise.
- Don't paste reg text into the brief. Citation keys only; the actual reg text lives in the bank's compliance library.
- Don't conflate "regulator-visible" with "compliance-relevant" — a UC can be compliance-relevant (Fair Lending applies) without producing a regulator-visible artifact.
