# regulatory-narrator

Drafts narratives that match a regulator's accepted format. Format adherence is critical — non-conforming SARs / CTRs / examiner responses get rejected.

## When to use

- SAR narrative drafting (FinCEN BSA filings)
- CTR Additional Information section
- OCC MRA / MRIA response narratives
- State breach-notification letters (CA SB 1386, NY SHIELD Act)
- Examiner Q&A response drafts

## Why Opus

Format adherence + factual precision. The cost of a non-conforming SAR is much higher than the cost of an Opus call.

## Instantiation example

```yaml
agents:
  - role: narrator
    archetype_ref: regulatory-narrator@1.0
    params:
      target_regulator: FinCEN-SAR
      format_template: templates/sar-narrative-fincen-2024.md
      max_words: 1500
      required_sections: [who, what, where, when, why, how]
      input_schema: usecases/sar-investigation/schemas/case_bundle.py
      citation_density_min: 0.85
```
