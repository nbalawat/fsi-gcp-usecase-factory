# SR 11-7 documentation template

```markdown
# SR 11-7 model risk management: {use_case_id}

## Model identification
- Model owner: {team}
- Model purpose: {description}
- Model components: rules + agents (see model_card.md)
- Model classification: {high | medium | low risk based on consequence}

## Conceptual soundness
{Explanation of why this approach is appropriate for the decision}

## Process verification
- Code review: PR-based, requires platform team approval
- Architecture audit: automated via plugin's architecture-auditor
- Compliance review: this document, reviewed by {team}

## Outcomes analysis
- Performance metrics tracked: {list}
- Drift monitoring: enabled, threshold {%}
- Periodic re-validation: {frequency}

## Limitations and uncertainty
{Honest assessment of what the model can and can't do}
{What would cause it to fail}
{Sensitivity to input quality}

## Independent validation
- Validation status: {pending | in-review | approved | requires-revalidation}
- Validation team: {team}
- Last validated: {date}
- Next validation due: {date}

## Ongoing monitoring
- Daily: error rates, latency budgets
- Weekly: decision distribution, drift signals
- Monthly: agent prompt review, eval set updates
- Quarterly: full re-validation
- Annually: regulatory examination preparation

## Materiality
{If this model affects {N} decisions per period worth ${X}, materiality is {classification}}

## Sign-offs required
- Model owner: {team}
- Independent validator: {team}
- Risk committee (if material): {committee}
- Chief Risk Officer (if high-risk): yes/no
```
