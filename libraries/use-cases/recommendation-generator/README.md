# Use-case archetype: recommendation-generator

Whole-use-case template for agent-suggested actions queued for human review. Wealth rebalancing, NBA, syndicated waterfall, RCSA suggestions.

## Shape

```
trigger → [handler]
            ↓
        [fan-out atomic services] (state + signals)
            ↓
        [rules-service] (eligibility filter)
            ↓
        [eligibility-checker / risk-rater] (suggestion + rationale + confidence)
            ↓
        [recommendation-queue]
            ↓
        [human disposition] ─→ accept ──→ [actuation-sink]
                            ─→ edit + accept
                            ─→ defer
                            ─→ reject (feeds eval set)
```

## Picks the recommendations-console

Console shows a queue of recommendations with full impact analysis and inline accept/edit/defer/reject actions. Each recommendation has reasoning provenance.

## Critical: no auto-actuation

Recommendations NEVER actuate without a human. The rebalancing trade isn't placed; the cross-sell offer isn't sent. Only the actuation-sink fires on accept, and the workflow's approval-gate guards that path.

## Eval feedback loop

Rejected recommendations are gold-standard signal for the eval set. The rejection reason (when captured by the human) tells the team where the model is over-suggesting.

## Fits

- Wealth rebalancing (drift breaches → rebalance proposal)
- Next best action (cross-sell / retention / collections triage)
- Syndicated loan waterfall (post-default cash distribution proposal)
- Risk-control self-assessment (control gap recommendations)
- Product cross-sell offers
