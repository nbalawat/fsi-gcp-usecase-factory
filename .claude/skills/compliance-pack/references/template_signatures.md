# Signatures required template

```markdown
# Signatures required: {use_case_id}

Before this use case can be promoted to production, the following sign-offs must be obtained.

## Engineering
- [ ] Platform team architectural approval
- [ ] Security team review
- [ ] SRE readiness review (runbook complete, alerts configured)

## Risk and compliance
- [ ] Model owner sign-off (model_card.md reviewed)
- [ ] Independent model validator sign-off (sr_11_7_documentation.md reviewed)
- [ ] Compliance team sign-off ({regulation-specific reviews})

## Use-case-specific (per regulation)
{Add specific sign-offs based on regulatory regime, e.g.:}
- [ ] BSA officer (for AML/SAR use cases)
- [ ] Privacy officer (for use cases handling PII at scale)
- [ ] CCO (for high-risk consumer-facing decisions)

## Risk committee
- [ ] Risk committee approval (required if materiality is high)

## Final
- [ ] CRO awareness (for high-risk; not required for medium/low)

Each sign-off should be recorded with name, date, role, and any conditions.
```
