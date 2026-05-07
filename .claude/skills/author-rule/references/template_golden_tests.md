## Step 6 — Generate golden test set

Create `tests/golden/{rule_name}/test_cases.json`:

```json
{
  "rule": "{rule_name}",
  "version": "1.0",
  "cases": [
    {
      "name": "happy_path_clear",
      "input": { "input_field_1": 100, "input_field_2": "low" },
      "expected_action": "clear",
      "expected_reasons": []
    },
    {
      "name": "boundary_threshold",
      "input": { "input_field_1": 5000, "input_field_2": "low" },
      "expected_action": "gray_zone",
      "expected_reasons": ["VELOCITY_ELEVATED"]
    },
    {
      "name": "decline_path",
      "input": { "input_field_1": 12000, "input_field_2": "high" },
      "expected_action": "decline",
      "expected_reasons": ["VELOCITY_HIGH", "MERCHANT_RISK"]
    }
  ]
}
```

Required minimum:
- 1 case per row in the decision table
- 1 case per boundary value (just above and just below thresholds)
- 1 default-rule case
- 3-5 real-world examples drawn from the user's domain knowledge

Ask the user for real-world examples; they're the most valuable test cases.

