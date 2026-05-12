# Section example — agent operating envelope

Sponsors typically struggle with this section. Below is how
credit-memo-commercial filled it, exposed to the user when they hit the
agent-envelope questions.

## 7.1 Decision points (real example)

| Decision | Type | Rationale | Owner |
|---|---|---|---|
| Should we extend credit | hybrid | analyst-rated risk band drives auto-approve cutoff; humans approve above threshold | analyst-agent + credit-committee |
| Is borrower over single-borrower-limit | rule | OCC §32.3 deterministic threshold | single_borrower_limit_check |
| Which covenants apply | agent | depends on industry + structure + borrower history — judgment-heavy | covenant-designer |
| Risk band rating (1-pass through 5-loss) | hybrid | analyst proposes; rules engine validates against bank's rating policy | rater |
| Is borrower an insider (Reg O) | rule | structured lookup against insider master | reg_o_check |
| Is the memo's prose grammatically correct | n/a (do not validate this in production — model risk) | — | — |

## 7.2 Stage envelopes — what agents do/don't do per stage (real example)

**credit-analysis → analyst-agent**

_does:_
- Drafts the memo's qualitative sections (management quality, customer concentration, stress scenarios)
- Ranks risks by severity with rationale
- Narrates the peer benchmark (NAICS + size band)
- Cites every numeric claim back to its source document

_does NOT:_
- Decide approve / decline
- Set risk band (that's the rater)
- Define covenant package (that's covenant-designer)
- Post anything to the GL

## 7.3 Agent sketches (real example)

**analyst (analyst-multisection archetype, vertex-gemini)**

Produces 7-section memo body from atomic-service outputs + extracted docs.

| Field | Type | Required | Purpose |
|---|---|---|---|
| management_quality | string | yes | Plain-English narrative on management strength |
| customer_concentration | object | yes | Top-5 customer revenue % + commentary |
| stress_scenarios | array | yes | Each scenario: name, assumption, projected DSCR |
| regulatory_flags | array | no | Reg O / single-borrower / industry concentration issues |
| citations | array | yes | Per-claim citation chain (doc_id, page, bbox) |

**rater-with-covenant (rater-with-covenant archetype, vertex-gemini)**

Sets risk band + designs covenant package.

| Field | Type | Required | Purpose |
|---|---|---|---|
| risk_band | enum | yes | One of: 1-pass, 2-special-mention, 3-substandard, 4-doubtful, 5-loss |
| risk_drivers | array | yes | Ordered list of factors that drove the band |
| covenant_package | array | yes | Per covenant: type, threshold, test frequency, breach action |
| confidence | number | yes | 0.0–1.0 model confidence in the rating |

## What "good" looks like

- Every meaningful decision in the workflow gets a row in the decision-points table.
- For each row, the rationale answers "why this type and not another" — that's the test for clarity.
- Stage envelopes are explicit about what agents DO NOT do — preventing scope creep into rule territory.
- Agent sketches force structured-output thinking before any agent code is written.
