# Cutover runbook — credit-memo-commercial v1 → v2

The factory-grade rebuild of credit-memo-commercial replaced 8 atomic
services with 5, 13 agents with 5, and the imperative
`services/orchestrator-credit-memo` Cloud Run with a Cloud Workflows
execution. This runbook is the cutover plan.

## Pre-cutover checklist

| Gate | Verification |
|---|---|
| Track A — document-extractor | `pytest services/atomic/document-extractor/tests` — 60 tests, 55 verified live |
| Track A.3 — multi-doc API | `pytest usecases/credit-memo-commercial/tests/test_multi_doc_ingest.py -m live` — 7/7 |
| Track B — atomic services | `pytest services/atomic/loan-serviceability services/atomic/peer-and-industry-context services/atomic/borrower-network` — 17/17 parity green |
| Track C — agents | `pytest usecases/credit-memo-commercial/tests/test_consolidated_agents.py -m "not live"` — 20/20 |
| Track D — workflow | `python3 scripts/test_workflow_dryrun.py` — exit 0 |
| Track D — audit-writer | `pytest services/audit-writer/tests` — 9/9 |
| Track E — validation gate | `pytest usecases/credit-memo-commercial/tests/test_validation_gate.py` — 25/25 |
| Track F — UI components | `cd ui/apps/pipeline-console && npx tsc --noEmit` — 0 errors |

Every row green — no exceptions.

## Cutover sequence

### Day 0 — Deploy the new stack alongside the old

1. Deploy new atomic services:
   ```
   bash scripts/deploy_service.sh loan-serviceability
   bash scripts/deploy_service.sh peer-and-industry-context
   bash scripts/deploy_service.sh borrower-network
   bash scripts/deploy_service.sh document-extractor
   bash scripts/deploy_service.sh audit-writer
   ```
2. Deploy new agents (each is a Cloud Run service hosting one ADK agent):
   ```
   for a in document_processor analyst rater_and_covenant_designer drafter reviewer; do
     bash scripts/deploy_agent.sh $a
   done
   ```
3. Enable Cloud Workflows API + deploy the v2 workflow:
   ```
   gcloud services enable workflows.googleapis.com
   gcloud workflows deploy credit-memo-commercial-v2 \
     --source=usecases/credit-memo-commercial/workflow.v2.yaml \
     --service-account=fsi-workflow-sa@${GCP_PROJECT}.iam.gserviceaccount.com \
     --region=${GCP_REGION}
   ```
4. Wire Eventarc trigger on `credit-memo-commercial.enriched`:
   ```
   gcloud eventarc triggers create credit-memo-v2-trigger \
     --destination-workflow=credit-memo-commercial-v2 \
     --destination-workflow-location=${GCP_REGION} \
     --transport-topic=projects/${GCP_PROJECT}/topics/credit-memo-commercial.enriched \
     --event-filters=type=google.cloud.pubsub.topic.v1.messagePublished
   ```
5. The legacy orchestrator REMAINS subscribed to the same topic. Both the
   old orchestrator and the new workflow now process every case in
   parallel. Outputs go to two tables:
   - Old orchestrator → `application_state` (primary)
   - New workflow → `application_state_v2_shadow` (parity-only)

### Days 1–7 — Parity verification

Cron `scripts/parity_v1_v2.py --since=24h --threshold=100` runs nightly:
- Pulls every case completed in the last 24 hours.
- Compares v1's `application_state` row vs v2's `_v2_shadow` row.
- Asserts decision + risk_band + DSCR + leverage + single_borrower_pct
  match exactly.
- Decision-level mismatch → page on-call.

The parity script produces a JSON report at
`gs://${GCP_PROJECT}-parity-reports/credit-memo-v2/<date>.json`.

If at any point during the 7 days the parity rate drops below 100% on
decision/risk_band, the cutover halts and the team investigates before
proceeding.

### Day 8 — Promote v2 to primary

Provided 7 consecutive days at 100% decision parity:

1. Update workflow.v2.yaml's audit-writer calls to write to
   `application_state` directly (drop the shadow table).
2. Update Eventarc:
   - Disable the legacy orchestrator's Pub/Sub subscription.
   - Workflow becomes the only consumer.
3. Smoke `bash scripts/smoke_e2e_v2.sh` against the dev project — must
   produce a v2-only case with all stages green.

### Days 9–38 — Soak (legacy as fallback)

The legacy orchestrator + 8 old services + 13 old agents remain deployed
but receive no Pub/Sub traffic. They are still callable via direct HTTP
for emergency rollback (re-enable the subscription).

Daily monitoring:
- Cloud Workflows execution failure rate (target < 0.5%)
- p95 case wall-time (target < 300s, vs ~300s on v1)
- Cost per case (target < $0.10 vs ~$0.15 on v1)

Any regression triggers rollback (re-enable subscription, file an issue,
do not decommission).

### Day 39 — Decommission

Provided 30 days clean since cutover:

```
# Remove subscriptions to .enriched
gcloud pubsub subscriptions delete fsi-orch-credit-memo-sub

# Tear down legacy services
for s in dscr-calculator covenant-analyzer peer-benchmarker \
         industry-risk-scorer exposure-aggregator insider-screening \
         orchestrator-credit-memo; do
  gcloud run services delete fsi-$s --region=${GCP_REGION} --quiet
done

# Tear down legacy agents
for a in document_classifier extractor financial_spreader_agent \
         peer_set_curator management_quality_rater \
         customer_concentration_analyzer stress_scenario_modeler \
         collateral_appraiser regulatory_checker covenant_designer \
         rater memo_reviewer; do
  gcloud run services delete fsi-agent-$a --region=${GCP_REGION} --quiet
done
```

Update `services/atomic/` to delete the legacy service directories;
keep them in git history.

## Rollback procedure

If during any phase parity breaks or the v2 path fails:

1. Re-enable the legacy orchestrator subscription:
   ```
   gcloud pubsub subscriptions create fsi-orch-credit-memo-sub \
     --topic=credit-memo-commercial.enriched \
     --push-endpoint=$(gcloud run services describe fsi-orch-credit-memo --format='value(status.url)')/process
   ```
2. Disable the v2 Eventarc trigger.
3. File a P1 incident with the parity diff.

The blast radius of rollback is bounded: legacy services were not
modified during Tracks B-D (only NEW services were added in parallel),
so re-enabling the legacy path has zero migration risk.

## Cost / latency targets

| Metric | v1 (legacy) | v2 (target) |
|---|---|---|
| Per-case cost | ~$0.15 | < $0.10 |
| p95 wall-time | ~300s | < 300s (multi-doc parallel) |
| Atomic services count | 8 | 5 |
| Agent count | 13 | 5 |
| Workflow lines | 408 (undeployed) | 378 (deployed) |
| Per-doc cost | n/a | < $0.50 (Landing AI ADE) |

## Out of scope (deferred — not blocking cutover)

- LiteParse + Vertex Gemini fallback path (vendor abstraction exists in
  document-extractor; production deployment deferred to incident-driven
  trigger).
- Real-time streaming citations during memo draft (post-MVP polish).
- Promote agent archetypes to `libraries/agents/` (Track G+ — the
  consolidation already produces reusable templates).
