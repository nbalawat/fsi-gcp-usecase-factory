# Onboarding a new use case

How to add use case #2 (and #3, …, #100) to this platform without
re-litigating architecture every time.

This is the runbook a use-case team follows. It is the answer to the
question "where do I start?" for any new commercial banking workflow
the bank wants to put on this platform.

The credit-memo-commercial use case is the canonical reference.
Every new use case shares the same 5-step paradigm:

```
handler → atomic services → rules → agent → sinks
```

What changes between use cases is **business content** (rules,
prompts, fixtures, console config), **not architecture**.

---

## Inventory: what's reusable vs net-new

### Reusable as-is (no edits)

| Layer | Asset | Path |
|---|---|---|
| Compute | 8 atomic services | `services/atomic/{financial-spreader,dscr-calculator,covenant-analyzer,peer-benchmarker,industry-risk-scorer,collateral-valuator,exposure-aggregator,insider-screening}/` |
| Compute | rules-service singleton | `services/rules-service/` |
| Compute | orchestrator pattern (per UC) | copy `services/orchestrator-credit-memo/` → `services/orchestrator-<uc>/` |
| Rules | 7 framework-shared regulatory rules | `rules/{regulatory_thresholds, single_borrower_exposure, sector_concentration_limit, geographic_concentration_limit, cre_concentration_limit, leverage_threshold_by_industry, dscr_threshold_by_industry, insider_aggregate_limit, reg_o_individual_limit}/` |
| Agents | 12 specialist archetypes | `libraries/agents/<archetype>/` (document-classifier, document-extractor, financial-spreader, peer-set-curator, stress-scenario-modeler, collateral-appraiser, covenant-designer, regulatory-checker, customer-concentration-analyzer, management-quality-rater, risk-rater, narrative-drafter, memo-reviewer) |
| UI | shadcn/ui primitives | `ui/apps/<console>/components/ui/` |
| UI | Atrium theme | `ui/packages/theme/` |
| UI | shared components | `ui/packages/components/src/` (AppShell, BreadcrumbNav, MetricStrip, RegulatoryClock, etc.) |
| Infra | 11 Terraform modules | `infra/modules/{atomic_service,handler_service,rules_service,…}/` |
| Operations | dev_up.sh, smoke_e2e.sh | `scripts/` |

### Always net-new for each use case

| Asset | Path | Why it's specific |
|---|---|---|
| **REASONS canvas** | `usecases/<uc>/reasons.yaml` | The contract — every other artifact derives from this |
| **Handler** | `usecases/<uc>/handler/` | Knows the inbound event shape (loan application, payment event, KYC docket) |
| **Use-case rules** | `usecases/<uc>/rules/` | e.g. `credit-memo-eligibility`, `approval_matrix_commercial` (per-product) |
| **Agent prompts** | `usecases/<uc>/agents/prompts/*.md` | Banker voice + domain detail (commercial credit ≠ payment fraud ≠ AML SAR) |
| **Workflow YAML** | `usecases/<uc>/workflow.yaml` (or orchestrator main.py) | Composes the 5-step paradigm for this UC |
| **Console config** | `usecases/<uc>/ui/console.yaml` | Picks 1 of 6 console patterns + per-page config |
| **Demo fixtures** | `usecases/<uc>/demo-data/` + `scripts/demo_fixtures/` | Synthetic borrowers / cases |
| **Compliance pack** | `usecases/<uc>/compliance/` | SR 11-7 model card, risk assessment, audit trail spec |
| **Schemas (if richer than UC default)** | `usecases/<uc>/schemas/` | e.g. `credit_memo.schema.json` |

---

## The fixed sequence

### 1. Pick the use case archetype (Layer 6 reuse)

```bash
ls libraries/use-cases/
# pipeline-originator, real-time-scorer, surveillance-evaluator,
# investigation-initiator, recommendation-generator, run-exerciser
```

The archetype answers half the diagnostic questions in `/new-use-case`:
which console, which agent pattern, which workflow fragments.

| If your use case is … | Pick archetype | Console |
|---|---|---|
| Multi-day flow with stages + approval (commercial loan, mortgage, KYC) | `pipeline-originator` | `pipeline-console` |
| Sub-second decision (payment fraud, RTP) | `real-time-scorer` | `realtime-console` |
| Continuous portfolio re-eval (CRE, deposit pricing) | `surveillance-evaluator` | `surveillance-console` |
| Case investigation with regulatory clock (BSA SAR, disputes) | `investigation-initiator` | `investigations-console` |
| Agent suggestions for human disposition (NBA, wealth) | `recommendation-generator` | `recommendations-console` |
| Periodic deadline-driven exercise (CECL, RCSA) | `run-exerciser` | `run-console` |

### 2. Author the REASONS canvas (the contract)

```bash
mkdir -p usecases/<uc>
cd usecases/<uc>
# Either:
claude  # then: /init-use-case "<short name>"
# Or copy the credit-memo template:
cp ../credit-memo-commercial/reasons.yaml ./reasons.yaml
$EDITOR reasons.yaml
```

Fill in all 7 sections (Requirements, Entities, Approach, Structure,
Operations, Norms, Safeguards). The Structure section pins library
versions for every reuse. Don't skip — `architecture-auditor` blocks
the commit otherwise.

### 3. Scaffold the directories

```bash
claude  # then: /new-use-case
```

This generates skeletons for handler, agents, rules, workflow, infra,
tests, compliance, demo-data based on the archetype + REASONS.

### 4. Build everything in parallel

```bash
claude  # then: /fsi-build-parallel
```

Fans out to 12 builder subagents (handler-builder, atomic-service-builder
×N for any net-new services, jdm-rule-builder ×N, agent-specialist-builder
×N, workflow-builder, terraform-author, console-config-builder,
e2e-test-builder, demo-data-builder, compliance-doc-builder).

### 5. Review before merge

```bash
claude  # then: /review-uc <uc>
```

Runs architecture-auditor + compliance-reviewer + security-reviewer +
test-author coverage check. Blocks the PR if any fails.

### 6. Smoke test the full lifecycle

```bash
# Bring up local dev
bash scripts/dev_up.sh --background
# Run the use case's smoke test
bash usecases/<uc>/scripts/smoke_e2e.sh
# Or copy + adapt the credit-memo smoke test:
cp scripts/smoke_e2e.sh usecases/<uc>/scripts/smoke_e2e.sh
$EDITOR usecases/<uc>/scripts/smoke_e2e.sh    # update assertions
```

The smoke test must pass before any deployment.

### 7. Promote

```bash
claude  # then: /promote <uc> --env=staging
```

Requires signed compliance pack + green smoke + cross-impact analyzer
clean.

---

## Reuse-rate targets (rule of three)

| Use case # | Atomic services | Agent archetypes | Workflow fragments | Rules |
|---|---|---|---|---|
| #1 (credit-memo) | 8 net-new | 13 net-new | net-new | 7 framework + 5 UC |
| #2 (your next) | **6+ reused** | **6+ reused** | **3+ reused** | **5+ framework reused** |
| #3 | 7+ reused | 8+ reused | 5+ reused | 6+ framework reused |
| #5+ | 8+ reused | 10+ reused | 7+ reused | 7 framework reused |

If your use case can't reuse at least 60% of the assets above, the
abstractions are wrong — propose a library-level fix before forking.

---

## What `/fsi-build-parallel` builds for you

Wall-clock: ~2 hours from REASONS canvas to a working use case (vs ~5
weeks sequential).

Builders fan out across distinct write paths so they can't conflict:

```
handler-builder           → usecases/<uc>/handler/
atomic-service-builder ×N → services/atomic/<new-svc>/
jdm-rule-builder ×N       → usecases/<uc>/rules/<rule>/
agent-specialist-builder  → usecases/<uc>/agents/<role>.py
workflow-builder          → usecases/<uc>/workflow.yaml
terraform-author          → usecases/<uc>/infra/<uc>.tf
console-config-builder    → usecases/<uc>/ui/console.yaml
e2e-test-builder          → usecases/<uc>/tests/
demo-data-builder         → usecases/<uc>/demo-data/
compliance-doc-builder    → usecases/<uc>/compliance/
```

Validators (architecture-auditor, compliance-reviewer, security-reviewer)
run sequentially after the parallel build joins. They need the complete
artifact set.

---

## Common pitfalls (mistakes paid for during use case #1)

1. **Don't pepper defensive null checks in every component.** Use
   `<SectionErrorBoundary>` (in `ui/apps/<console>/components/section-error-boundary.tsx`)
   at the section level once. Components stay simple.

2. **Don't put atomic services on private IP only without setting up
   the Cloud SQL Auth Proxy locally.** `bash scripts/dev_up.sh` handles it.
   New use case repos get the same script.

3. **The drafter agent's output drifts from the schema if the prompt
   isn't strict.** Include the EXACT schema as a JSON example in the
   prompt — see `usecases/credit-memo-commercial/agents/prompts/drafter.md`
   for the pattern.

4. **Pub/Sub push timeout vs Cloud Run timeout.** Cloud Run timeout
   ≥ Pub/Sub ack-deadline + safety margin. The orchestrator template
   sets `--timeout=3600s` on Cloud Run with a `--ack-deadline=600` push
   sub. Idempotency guard in `process()` skips redeliveries.

5. **Always-on smoke test before merge.** Every new use case ships
   with `usecases/<uc>/scripts/smoke_e2e.sh` modeled on the credit-memo
   one. CI runs it on every PR.

6. **Banker language in user-facing UI; jargon only in audit trail.**
   No `ADK`, `Zen JDM`, `5-step paradigm`, `atomic services`, Pub/Sub
   topic names visible to the user. The smoke gate
   (`scripts/test_ui_smoke.mjs`) catches drift.

7. **Vertex Gemini > Anthropic SDK for ADC simplicity.** No API keys
   to manage; service account already has IAM. Set `USE_GEMINI=1` (default).
   `gemini-2.5-pro` for reasoning agents, `gemini-2.5-flash` for cheap
   classifiers.

---

## Sanity check: is your use case ready to ship?

Run this checklist before `/promote`:

- [ ] `reasons.yaml` validates against `policies/reasons_schema.json`
- [ ] All atomic services + handler smoke-pass via `smoke_test_service.sh`
- [ ] All rules' golden tests pass
- [ ] `bash usecases/<uc>/scripts/smoke_e2e.sh` returns 0
- [ ] `node scripts/test_ui_smoke.mjs` passes
- [ ] Compliance pack present (model card, risk assessment, audit trail spec)
- [ ] `architecture-auditor` PASS verdict
- [ ] Cost per case + per-day projected and within budget
- [ ] Reuse % per layer meets the rule-of-three target

If all 9 are green, `/promote` is safe.
