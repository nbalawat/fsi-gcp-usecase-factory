# Helper scripts

These scripts are invoked by skills and hooks. They handle bank-specific operations that don't belong in the skills themselves (because they shell out to GCP, run validation tools, etc.).

## Inventory

| Script | Invoked by | Purpose |
|--------|------------|---------|
| `jdm_lint.sh` | `/author-rule` | Validates JDM JSON against schema |
| `workflow_lint.sh` | `/new-use-case`, `/review-uc` | Validates Cloud Workflows YAML |
| `run_golden_tests.py` | `/author-rule` | Executes JDM golden test cases via GoRules Zen |
| `deploy_preview.sh` | `/new-atomic-service`, `/promote` | Deploys to ephemeral preview env |
| `provision_preview.sh` | `/promote` | Spins up ephemeral GCP project |
| `wait_for_healthy.sh` | `/promote` | Polls services until health checks pass |
| `synthetic_load.sh` | `/promote` | Runs production-like load against preview |
| `policy_check.sh` | `/new-atomic-service`, `/review-uc` | Runs OPA policies against Terraform |

## Implementation status

These scripts are stubs in v0.1.0 of the plugin. Each one needs to be implemented against the bank's specific GCP project structure, IAM, and tooling.

The platform team owns these. They are NOT generic — they reference the bank's:
- GCP organization structure (project naming, folder layout)
- Service account configuration
- Container registry
- VPC and networking topology
- Secret Manager paths
- Monitoring backends

To implement a script:
1. Read the skill that invokes it to understand expected inputs/outputs
2. Implement against the bank's actual infrastructure
3. Test in the platform team's sandbox project
4. Land via PR to this plugin repo

## Stub behavior

Each stub script in this directory:
- Logs what it would do
- Returns success (exit 0) so skills can be tested without real infrastructure
- Has a TODO comment marking what needs implementation

This lets teams use the plugin's skills end-to-end during development, then swap in real implementations as the bank's environment matures.
