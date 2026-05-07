# Validator test fixtures

Same shape as gatekeeper fixtures: each scenario is a `<scenario>/` directory
with a `MANIFEST.yaml` and the artifact tree the validator should evaluate.

Manifest fields specific to validators:

```yaml
validator: service-validator           # which validator
spec:                                  # what the orchestrator passes in
  use_case_id: example-uc
  operation_id: example-service
  operation_path: services/atomic/example-service
  service_type: atomic-service
  inputs: [field_a, field_b]
  outputs: [result_a]
expects:
  verdict: PASS | WARN | FAIL
  failing_check: tests-pass            # which check the validator should flag
  cite_file: services/atomic/example-service/main.py
  message_contains: "..."
```
