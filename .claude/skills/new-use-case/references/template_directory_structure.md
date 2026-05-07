## Step 7 — Generate the directory structure

Create:

```
usecases/{use_case_id}/handler/
  main.py                  (use handler-design skill template)
  Dockerfile
  pyproject.toml
  service.tf
  tests/test_main.py

services/atomic/{new_service_name}/  (one per new atomic service)
  main.py                  (use atomic-service-design skill template)
  manifest.json            (MCP manifest)
  Dockerfile
  pyproject.toml
  service.tf
  tests/test_main.py

usecases/{use_case_id}/agents/
  agent.py                 (use adk-agent-design skill template)
  prompts/                 (one .md file per agent in inner workflow)
  manifest.yaml            (A2A manifest, model selection)
  tests/eval.py
  tests/golden/            (golden test cases)
  tests/adversarial/       (prompt injection tests)

usecases/{use_case_id}/workflow.yaml  (use workflow-design skill template)

rules/{new_rule_name}.json    (one per new JDM rule)

usecases/{use_case_id}/tests/
  test_e2e.py              (full integration suite scaffold)

usecases/{use_case_id}/infra/{use_case_id}.tf  (Terraform module instantiation)

docs/use_cases/{use_case_id}/
  spec.md                  (one-page use case specification)
  dependencies.yaml        (consumes and produces)
  slos.yaml                (latency, error rate, decision distribution)
  compliance_pack/
    model_card.md
    decision_rationale.md
    audit_trail_spec.md
    sr_11_7_documentation.md

ui/use_cases/{use_case_id}/
  config.json              (configures the chosen console pattern)
```

For each file generated, populate from the appropriate skill's template directory (e.g., `${CLAUDE_PLUGIN_DIR}/skills/handler-design/template/`).

