# Factory coverage — six console patterns proven E2E

Six end-to-end runs through `/fsi-design-proposals` → `/fsi-design-review` —
one per console pattern in the methodology. Each run scored 4 (or 3, when
the worktree GC bit) designer-agent variants with the judge LLM, validated
deployed Cloud Run services with Playwright (axe-core + perf + console
errors), and locked the winner in `usecases/<uc>/ui/decision.yaml`.

## Locked winners — live URLs

The locked-winner option for each pattern is deployed to Cloud Run with
`allUsers` invoker. Losing options were torn down after the lockdown.

| Console pattern | Use case | Locked option | URL |
|---|---|---|---|
| Pipeline | `credit-memo-commercial-test` | D (conversation timeline) | https://fsi-uc-credit-memo-commercial-test-design-d-v4uibzu6ga-uc.a.run.app |
| Investigations | `sar-investigation-test` | D (counterparty graph) | https://fsi-uc-sar-investigation-test-design-d-v4uibzu6ga-uc.a.run.app |
| Real-time | `payment-fraud-scoring-test` | A (event-spine throughput) | https://fsi-uc-payment-fraud-scoring-test-design-a-v4uibzu6ga-uc.a.run.app |
| Surveillance | `cre-surveillance-test` | B (geographic map) | https://fsi-uc-cre-surveillance-test-design-b-v4uibzu6ga-uc.a.run.app |
| Run | `cecl-quarterly-run-test` | C (inline-action segments) | https://fsi-uc-cecl-quarterly-run-test-design-c-v4uibzu6ga-uc.a.run.app |
| Recommendations | `nba-recommendations-test` | C (inline disposition) | https://fsi-uc-nba-recommendations-test-design-c-v4uibzu6ga-uc.a.run.app |

Every service exposes:

- `/` — pattern-appropriate home (queue, grid, map, etc.)
- `/case/SAMPLE` — moment-of-truth detail screen
- `/approval/SAMPLE` — HITL action surface

## Why this matters

Before this work, the factory was proven on one pattern (pipeline /
credit memo). With six patterns proven, the dual-signal validation
protocol — judge LLM + Playwright runtime — is generalised. The
methodology can absorb a new use case in any of the six patterns
without bespoke design code.

## What each pattern catches

| Pattern | What it stresses | What we learned |
|---|---|---|
| Pipeline | 1D progression through stages | Layout-glitch defects (Playwright caught 7 the judge missed) |
| Investigations | Case-centric with regulatory clock | Server-component runtime failures (B returned HTTP 500 on every page; Playwright caught it) |
| Real-time | Throughput-dominant, no per-case staging | RSC violations during static page generation (D failed `buildEventHref` function-to-client-component) |
| Surveillance | 2D state grid, continuous re-eval | Designer-agent false success (C reported done; worktree was empty — codified as Rule 46) |
| Run | Periodic deadline-driven exercise | Business math in UI components (A synthesized PD curves in `SegmentLedger.tsx` — judge caught the Rule-1 violation) |
| Recommendations | Agent suggestions queued for disposition | When all options pass runtime, judge becomes primary signal (HITL discipline difference was invisible to Playwright) |

## Operational notes

- Each Cloud Run service is set to scale-to-zero; cold start ~1.5s, warm
  request ~50ms. Bill is dominated by build time (~4 min per option),
  not request volume.
- The 6 winners run on ~$0.50/month total at idle (Cloud Run free tier
  covers it). Tear down anytime via
  `gcloud run services delete fsi-uc-<uc>-design-<opt> --region=us-central1`.
- The full archive of each run (4 options pre-prune, judge report,
  Playwright reports, screenshots, manifest stamps) lives at
  `archives/design-tests/<timestamp>-<uc>-run<n>/`.
- Decision files at `usecases/<uc>/ui/decision.yaml` carry the full
  rationale, annotations (keep/drop/change), and rejected-option notes
  for each lockdown. They are the contract for downstream `/init-use-case`.

## Re-deploy / iterate

To rebuild a winner from source:

```bash
gcloud builds submit . \
  --config infra/templates/design-proposal-cloudbuild.yaml \
  --substitutions=_USE_CASE=<uc>,_OPTION=<opt> \
  --async --gcs-source-staging-dir=gs://agentic-experiments-fsi-design-build-artifacts/source
```

Then grant `allUsers` invoker (Cloud Run org DRS strips
`--allow-unauthenticated`):

```bash
gcloud run services add-iam-policy-binding fsi-uc-<uc>-design-<opt> \
  --region=us-central1 --member=allUsers --role=roles/run.invoker
```

To iterate a locked design (e.g. fix the a11y violations all six options
share), run `/fsi-design-proposals <uc> --respin` — that spawns 3 new
designer agents constrained by the `decision.yaml` keep/drop/change
annotations (max 1 respin per UC).
