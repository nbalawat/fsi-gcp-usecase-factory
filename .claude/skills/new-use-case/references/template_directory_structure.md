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

usecases/{use_case_id}/ui/
  console.yaml             (console-pattern config — drives the shared shell)
  tsconfig.json            (path-alias stub: @/* → console; @uc/* → here)
  components/              (USE-CASE-OWNED React components — see ui-standards skill)
    README.md              (notes which features live here)
  lib/                     (USE-CASE-OWNED data adapters, fixtures, types)

usecases/{use_case_id}/schemas/
  {artifact}.schema.json   (one per regulator-visible artifact — memo, decision, etc.)
```

For each file generated, populate from the appropriate skill's template directory (e.g., `${CLAUDE_PLUGIN_DIR}/skills/handler-design/template/`).

### UI tree — IMPORTANT

`usecases/{use_case_id}/ui/components/` and `lib/` are where this use
case's UI lives. The shared shell at `ui/apps/<console-pattern>-console/`
mounts them via the `@uc/*` TypeScript path alias. **Never** put a
use-case-specific React component or data adapter in `ui/apps/<console>/`.
The CI gate `scripts/lint_uc_in_console.mjs` blocks any drift.

The `tsconfig.json` stub at `usecases/{use_case_id}/ui/tsconfig.json`
should look like:

```json
{
  "extends": "../../../ui/tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "baseUrl": ".",
    "paths": {
      "@fsi-bank/components": ["../../../ui/packages/components/src/index.ts"],
      "@fsi-bank/components/*": ["../../../ui/packages/components/src/*"],
      "@fsi-bank/theme": ["../../../ui/packages/theme/src/index.ts"],
      "@/*": ["../../../ui/apps/<console>-console/*"],
      "@uc/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

The shell's tsconfig at `ui/apps/<console>-console/tsconfig.json` adds
the reciprocal `@uc/*` alias and includes the use case's `ui/**` files
in its `include` array. See `ui/apps/pipeline-console/tsconfig.json` for
the canonical example.

