# staging environment

Same shape as `infra/dev/` with these differences:

| Setting | dev | staging | prod |
|---|---|---|---|
| Memory Bank nodes | 1 | 2 | 3 |
| `deletion_protection` | false | true | true |
| Trace sampling | 100% | 100% | 10% |

Apply order is the same: `infra/shared/` → `infra/staging/` → per-UC TF.

Use staging to validate the full e2e flow against real GCP resources before promoting to prod. This is what `/promote` deploys to before clearing the use case for prod cutover.
