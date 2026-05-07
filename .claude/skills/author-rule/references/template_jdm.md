## Step 4 — Author the JDM

Generate `rules/{rule_name}/v{version}.json`. Example structure:

```json
{
  "name": "{rule_name}",
  "version": "1.0",
  "effective_from": "2026-01-01",
  "effective_to": null,
  "description": "{one-sentence description}",
  "owner": "compliance-team",
  "regulatory_citation": "{e.g. BSA 31 CFR 1010.310}",
  "nodes": [
    {
      "id": "input",
      "type": "inputNode",
      "name": "Input"
    },
    {
      "id": "main_check",
      "type": "decisionTableNode",
      "name": "{descriptive name}",
      "content": {
        "rules": [
          {
            "input_field_1": "> 10000",
            "input_field_2": "in [\"high\", \"blocked\"]",
            "action": "decline",
            "reasons": ["VELOCITY_HIGH", "MERCHANT_RISK"]
          },
          {
            "input_field_1": "> 5000",
            "action": "gray_zone",
            "reasons": ["VELOCITY_ELEVATED"]
          },
          {
            "default": true,
            "action": "clear",
            "reasons": []
          }
        ]
      }
    },
    {
      "id": "output",
      "type": "outputNode",
      "name": "Output"
    }
  ],
  "edges": [
    {"source": "input", "target": "main_check"},
    {"source": "main_check", "target": "output"}
  ]
}
```

Key fields:
- `effective_from` / `effective_to` — when this version is active
- `regulatory_citation` — auditors will look for this
- `owner` — who can approve changes

