# Onboarding walkthrough — from zero to deployed UC

The concrete, follow-along version. Every step has the exact command,
expected output, what to verify before moving on, and what to do when
it goes wrong. The worked example throughout is `mortgage-origination`
— a hypothetical second UC after `credit-memo-commercial`.

If you're new to the factory: also read `README.md` and
`using-the-factory.md` first. This walkthrough assumes you know what
the 5-step paradigm is and what the six console patterns are.

**Estimated total time:** 4-5 hours wall clock, of which ~1 hour is
you making decisions and ~3 hours is waiting on builds + agents.

---

## Day -1 — Prerequisites (15 min, one-time setup)

You only do this once per dev machine. Skip if you've already shipped a UC.

### 1. Repo

```bash
git clone git@github.com:nbalawat/fsi-gcp-usecase-factory.git
cd fsi-gcp-usecase-factory
```

### 2. Credentials

```bash
# Authenticate with gcloud
gcloud auth login
gcloud auth application-default login        # for ADC
gcloud config set project agentic-experiments

# Verify
gcloud auth list
# Expect: ACTIVE account = your email
gcloud projects describe agentic-experiments --format="value(projectId)"
# Expect: agentic-experiments
```

### 3. Environment

```bash
source dev.env
# Expect: "dev.env loaded — project: agentic-experiments, region: us-central1"
```

If `dev.env` is missing, copy `dev.env.example` and fill in. **Do NOT
commit `dev.env`** — it's in `.gitignore`.

### 4. Cloud SQL proxy (for local DB reads/writes)

```bash
# Check if already running
ps aux | grep -v grep | grep cloud-sql-proxy

# If not running, start it (one-time per shell session):
/tmp/cloud-sql-proxy --port=5432 \
  --credentials-file=keys/agentic-experiments-71fb77221637.json \
  agentic-experiments:us-central1:fsi-banking-dev &

# Verify
nc -zv localhost 5432
# Expect: "succeeded"
```

If `/tmp/cloud-sql-proxy` is missing, download from
[google-cloud-sql-proxy releases](https://github.com/GoogleCloudPlatform/cloud-sql-proxy/releases).

### 5. Tooling versions

```bash
node --version        # expect: v20.x or higher
pnpm --version        # expect: 9.x
python3 --version     # expect: 3.11 or higher
docker --version      # expect: any recent
gcloud --version | head -1  # expect: 480+ for the artifactregistry api
```

### 6. Sanity check

```bash
make test-all
# Expect: "All assertions passed." in ~30 seconds, fully offline.
```

If `make test-all` fails on a fresh clone, **stop**. Something is broken
in your setup — don't proceed until offline tests are green.

---

## Step 1 — Read first (30 min, one-time)

Before touching code, read these in order:

```bash
$EDITOR docs/methodology/architecture.md            # 5-step paradigm  (~5 min)
$EDITOR docs/methodology/factory-cookbook.md         # 12 proven patterns (~10 min)
$EDITOR docs/methodology/product-build-discipline.md # 37 paid-for rules  (~10 min)
$EDITOR docs/methodology/console_reference.md        # 6 console patterns (~3 min)
$EDITOR docs/methodology/ux-first-discipline.md      # why UX-first       (~2 min)
```

After this, you should be able to answer:
- What are the 5 steps?
- What are the 6 console patterns?
- Why must UX be locked before backend builds?
- Where do thresholds live? (Cloud SQL `thresholds` table, never hardcoded.)
- What does `/fsi-prompt-update` do that direct code edits cannot?

If you can't answer any of these, re-read the relevant doc.

---

## Step 2 — `/fsi-onboard mortgage-origination` (~45 min)

This is the 7-round canvas-building journey. You answer 7 questions
via `AskUserQuestion`; the skill writes `onboarding/mortgage-origination.yaml`.

### What you'll do

```
$ /fsi-onboard mortgage-origination
```

The skill walks 7 rounds in order. Sample answers below — yours will
differ based on your actual UC, but mortgage-origination is a good
mental model.

### Round 1: Console pattern

```
Question: "What is the dominant UX shape for this use case?"
Options:  real-time / investigations / pipeline / surveillance / run / recommendations
```

**For mortgage-origination:** `pipeline` — applications move through
stages over days.

### Round 2: Use-case archetype

```
Question: "Start from a use-case archetype, or build the structure yourself?"
Options:
  1. Use archetype: pipeline-originator@1.0 (Recommended)
  2. Use a different archetype
  3. Build from scratch (REQUIRES JUSTIFICATION)
```

**For mortgage-origination:** Option 1. The `pipeline-originator` archetype
already wires `fan-out-join + agent-call-with-retry + approval-gate +
sink-fanout + regulatory-clock + dlq-on-failure`. Saves ~5 days of
plumbing.

### Round 3: HITL gates

```
Question: "Where do humans need to approve / review / sign?"
Options (multiSelect):
  - Final approval only (Recommended)
  - Review checkpoint + final approval
  - Per-stage review (4 gates)
  - No HITL (advisory output)
```

**For mortgage-origination:** "Per-stage review (4 gates)" if loans
exceed $1M (extraction → rating → draft → final). "Review checkpoint
+ final approval" if smaller. Match the existing credit-memo-commercial
pattern for $25M revolvers.

### Round 4: Atomic services

```
Question: "Which existing atomic services does this use case need?"
Inventory:  financial-spreader, loan-serviceability, peer-and-industry-context,
            borrower-network, collateral-valuator, document-extractor, …
```

**For mortgage-origination:** All 6 from credit-memo-commercial:
`financial-spreader, loan-serviceability, peer-and-industry-context,
borrower-network, collateral-valuator, document-extractor`.

Then: "Net-new atomic services?" → **No**. The 6 above cover everything
a residential / commercial mortgage application needs.

### Round 5: Multi-agent pattern + archetypes

```
Question: "Which multi-agent pattern fits the agent loop?"
Recommended: extractor-spreader-rater-drafter@1.0
```

**For mortgage-origination:** Recommended pattern. Bundle wires:
document-processor → analyst-multisection → rater-with-covenant →
narrative-drafter → memo-reviewer-v2.

"Additional agents?" → **No**. Pattern bundle is sufficient.

### Round 6: Rules + thresholds

```
Question: "Which existing JDM rules apply?"
Inventory: single_borrower_exposure, dscr_threshold_by_industry,
           leverage_threshold_by_industry, cre_concentration_limit,
           geographic_concentration_limit, reg_o_individual_limit, …
```

**For mortgage-origination:** 4 rules: `dscr_threshold_by_industry,
leverage_threshold_by_industry, cre_concentration_limit,
geographic_concentration_limit`.

"Net-new rules?" → **Yes, one**: `ltv_threshold_by_property_class`
(LTV by property class — OCC Bulletin 2013-26 governs real-estate
lending standards).

### Round 7: Model + prereqs + compliance

```
Question 1: "Which model provider for the agents?"
```

**Hybrid** (Anthropic primary + Vertex fallback gated by USE_GEMINI).

```
Question 2: "Confirm each prerequisite is met."
```

Tick every box. If any prereq is pending, attach the Jira ticket.

```
Question 3: "Compliance disclosure scope?"  → Full pack
Question 4: "Wire eval framework now?"      → Yes (Recommended)
```

### What you should see at the end

```
$ ls onboarding/
mortgage-origination.yaml

$ node scripts/check_reuse_rate.mjs onboarding/mortgage-origination.yaml
╔═══════════════════════════════════════════════════════════════╗
║  Factory reuse-rate gate — mortgage-origination                ║
╚═══════════════════════════════════════════════════════════════╝

  ✓ Atomic services      100%  (6/6)
  ✓ Agent archetypes     100%  (5/5)
  ✓ Shared rules          80%  (4/5)
  • HITL gates              4  (target ≤ 4)

  All hard gates green.
```

### What to verify before continuing

```bash
# 1. Canvas exists + parses
cat onboarding/mortgage-origination.yaml | head -20

# 2. Reuse gate green (re-run is idempotent)
node scripts/check_reuse_rate.mjs onboarding/mortgage-origination.yaml
echo "exit=$?"   # expect 0

# 3. Console pattern is one of the six
grep -E '^console_pattern:' onboarding/mortgage-origination.yaml
# expect: console_pattern: pipeline  (or whichever you picked)
```

If reuse gate fails, **go back to Round 4 / Round 5** and reduce net-new
shapes. Don't override unless arch-review approves with a captured ticket.

---

## Step 3 — `/fsi-design-proposals mortgage-origination` (~25-30 min, mostly waiting)

This spawns 4 parallel sealed designer agents. They each build a working
Next.js prototype with a distinct variation axis, deploy each to its own
ephemeral Cloud Run URL, and hand back to you for review.

### What you'll see

```
$ /fsi-design-proposals mortgage-origination

→ pre-flight (Stage 1)
  ✓ canvas SHA: a9489828b0fe9bac… (echoed by every designer agent)
  ✓ generated usecases/mortgage-origination/ui/proposals/_shared/mock-data.ts
    (6 atomic stubs, 5 agent stubs, 22 events, 12 borrowers)
  ✓ created worktree branches:
      design/mortgage-origination-option-a
      design/mortgage-origination-option-b
      design/mortgage-origination-option-c
      design/mortgage-origination-option-d

→ spawning 4 designer agents (sealed, parallel)
  · Option A · density       → ../mortgage-origination-option-a
  · Option B · metaphor      → ../mortgage-origination-option-b
  · Option C · affordance    → ../mortgage-origination-option-c
  · Option D · wildcard      → ../mortgage-origination-option-d

  (~15-20 min while agents run; you can grab coffee)

  ✓ Option A finished — tsc clean, 8 components used (5 shared, 3 net-new)
  ✓ Option B finished — tsc clean, 11 components used (8 shared, 3 net-new)
  ✓ Option C finished — tsc clean, 7 components used (4 shared, 3 net-new)
  ✓ Option D finished — tsc clean, 9 components used (3 shared, 6 net-new) ⚠ high net-new

→ Cloud Build × 4 (parallel, async)  (Stage 3)
  · BUILD_A   abcd-1234   running…
  · BUILD_B   abcd-1235   running…
  · BUILD_C   abcd-1236   running…
  · BUILD_D   abcd-1237   running…
  (~8-10 min while images build + deploy)

  ✓ A: https://fsi-uc-mortgage-origination-design-a-xxx-uc.a.run.app
  ✓ B: https://fsi-uc-mortgage-origination-design-b-xxx-uc.a.run.app
  ✓ C: https://fsi-uc-mortgage-origination-design-c-xxx-uc.a.run.app
  ✓ D: https://fsi-uc-mortgage-origination-design-d-xxx-uc.a.run.app

═══════════════════════════════════════════════════════════════
  Design proposals ready — mortgage-origination
═══════════════════════════════════════════════════════════════
  Built successfully  : 4/4
  Deployed            : 4/4
  Total cost          : $7.20
  Total time          : 27 min

Next: /fsi-design-review mortgage-origination
```

### What to verify before continuing

```bash
# 1. All 4 manifests have the matching canvas SHA
for opt in a b c d; do
  echo -n "$opt: "
  grep -E '^canvas_checksum:' usecases/mortgage-origination/ui/proposals/option-$opt/manifest.yaml
done
# All should match a9489828b0fe9bac…

# 2. URLs are reachable
for opt in a b c d; do
  url=$(cat .fsi-state/mortgage-origination/proposals/$opt.url)
  echo -n "$opt: "
  curl -sI "$url" | head -1
done
# All should show HTTP 200 or 302

# 3. Per-option tsc was clean
grep -E '^build:' -A 6 usecases/mortgage-origination/ui/proposals/option-*/manifest.yaml
# Each block should show tsc_clean: true, build_succeeded: true, deploy_succeeded: true
```

### What can go wrong

- **One option fails to compile (tsc errors).** OK to proceed — the
  comparator marks it ⚠ and you can pick from the other 3. If 3+ fail,
  re-run with `--respin --diverge`.
- **Cloud Build quota exceeded.** Wait 30 min and re-run; the skill
  resumes from `.fsi-state/<uc>/proposals/builds.json`.
- **All 4 agents converge (similar layouts).** Comparator scoring strip
  will show similar density / affordance / metaphor values. Re-run with
  `--respin --diverge` to force anti-convergence in agent prompts.

---

## Step 4 — `/fsi-design-review mortgage-origination` (~15-20 min)

You pick a winner. The skill writes `decision.yaml`, promotes the
winner, archives the losers, and tears down losing Cloud Run services.

### What you'll see

```
$ /fsi-design-review mortgage-origination

→ Building comparator (Stage 4)
  ✓ usecases/mortgage-origination/ui/proposals/_review.html

Open this in your browser:
  file:///Users/.../usecases/mortgage-origination/ui/proposals/_review.html

  · Click through each option's case-detail screen
  · Click through each option's approval-flow screen
  · Press 1/2/3/4 in the comparator to fullscreen each option
  · Note the scoring strip per option (density, motion, affordance, metaphor)
  · Read each option's rationale (right strip)

When ready to pick, hit ENTER.
```

### The browser side

The comparator opens 4 iframes side-by-side. **Spend at least 5 minutes
in EACH option** — first impressions are unreliable. Concrete things to do
in each:

1. **Click the borrower's name** on the case-detail page. Does it navigate
   somewhere meaningful?
2. **Find the "approve" affordance.** Where is it? How obvious? How many
   clicks to act?
3. **Scroll to the pipeline activity timeline.** Is it a drawer? A spine?
   A footer? How does each handle "lots of events"?
4. **Click into a citation** if the design supports them. Does it open
   the source? Or just show a tooltip?
5. **Imagine doing this 30 times a day.** Which option fatigues you fastest?

### Pick + annotate

```
[ Question 1 — which option resonates? ]
  · Option A · density (sparse executive)
  · Option B · metaphor (workflow-first)
  · Option C · affordance (inline-per-section)  ← (example pick)
  · Option D · wildcard (conversation timeline)

[ Question 2 — what to KEEP? ]
  Multi-select; e.g.
  ✓ inline-per-section approve/reject
  ✓ medium-dense analyst view
  ✗ pipeline-activity-as-spine

[ Question 3 — what to CHANGE? ]
  Free-form. Sample:
  "Hero panel is too tall on 1440px screens — compress to 40% viewport.
   The approval card should be sticky to the right rail, not inline at the
   top of the page."

[ Question 4 — lock level? ]
  · full (Recommended)
  · layout-only
  · metaphor-only

  → pick: full
```

### What you should see at the end

```
✓ promoted option C → usecases/mortgage-origination/ui/components/+app/
✓ tore down 3 Cloud Run services (a, b, d)
✓ archived A, B, D + comparator → archives/design/mortgage-origination/20260510T142233Z/
✓ wrote decision.yaml (lock_level=full, iteration_count=0)

═══════════════════════════════════════════════════════════════
  Design locked — mortgage-origination
═══════════════════════════════════════════════════════════════
  Chosen option       : C  (variation: affordance)
  Lock level          : full
  Cloud Run torn down : 3
  Archive             : archives/design/mortgage-origination/20260510T142233Z/

Next: /init-use-case mortgage-origination
```

### What to verify before continuing

```bash
# 1. decision.yaml exists + validates
cat usecases/mortgage-origination/ui/decision.yaml | head -15

# 2. Winner's promoted code is in place
ls usecases/mortgage-origination/ui/components/
ls usecases/mortgage-origination/ui/app/

# 3. Archive is intact
ls archives/design/mortgage-origination/*/
# expect: option-A/  option-B/  option-D/  _review.html

# 4. Losing Cloud Run services are gone
gcloud run services list --filter="metadata.labels.use-case=mortgage-origination" \
  --format="value(metadata.name)"
# expect: only fsi-uc-mortgage-origination-design-c (winner) OR empty

# 5. Winner's source pin is preserved
ls usecases/mortgage-origination/ui/proposals/option-c/
# expect: components/  app/  manifest.yaml  rationale.md  tradeoffs.md  Dockerfile
```

### What can go wrong

- **None of the options resonate.** Pick "None — re-spin." Capture
  your "why not" + positive direction. Then `/fsi-design-proposals
  mortgage-origination --respin`. One re-spin allowed; second requires
  arch-review.
- **You want to combine A's hero with C's right rail.** The "change"
  free-form captures that — the backend builder respects
  `annotations.change[]`. If the merge is structural enough that no
  single option is the basis, prefer re-spin with explicit "do C but
  with A's hero" instruction.
- **Cloud Run teardown fails for one service.** The lock still
  succeeds; the nightly `cleanup_design_proposals.sh --stale` will
  mop up.

---

## Step 5 — `/init-use-case mortgage-origination` (~5 min)

Scaffolds the UC directory tree. Refuses if `ui/decision.yaml` is
missing or canvas drift is detected.

### What you'll see

```
$ /init-use-case mortgage-origination

→ Step 0 — UX-first preflight
  ✓ usecases/mortgage-origination/ui/decision.yaml present
  ✓ canvas_checksum matches current onboarding/mortgage-origination.yaml
  ✓ design contract present and matches canvas

→ Creating directory tree
  ✓ usecases/mortgage-origination/handler/
  ✓ usecases/mortgage-origination/agents/
  ✓ usecases/mortgage-origination/sinks/
  ✓ usecases/mortgage-origination/rules/
  ✓ usecases/mortgage-origination/tests/
  ✓ usecases/mortgage-origination/compliance/
  ✓ usecases/mortgage-origination/demo-data/
  ✓ usecases/mortgage-origination/docs/

→ Stub files
  ✓ reasons.yaml             (seeded from onboarding.yaml)
  ✓ workflow.yaml            (seeded from pipeline-originator archetype)
  ✓ docs/spec.md             (template)
  ✓ docs/dependencies.yaml   (template)
  ✓ docs/slos.yaml           (template)
  ✓ compliance/model_card.md (template per SR 11-7)

Next: /fsi-reasons-canvas to refine reasons.yaml
      then /fsi-build-parallel
```

### What to verify

```bash
ls usecases/mortgage-origination/
# Expect: handler/ agents/ sinks/ rules/ tests/ compliance/ demo-data/
#         docs/ ui/ infra/ reasons.yaml workflow.yaml

# reasons.yaml should reflect canvas + design choices
grep -E '^(name|console_pattern|use_case_archetype):' usecases/mortgage-origination/reasons.yaml
```

---

## Step 6 — `/fsi-reasons-canvas mortgage-origination` (~10 min)

Refines `reasons.yaml` with use-case-specific business content. The
canvas already has the structure; you fill in the **content** (what the
agents extract, what the rules check, what the decision shape is).

### What you'll see

```
$ /fsi-reasons-canvas mortgage-origination

Reading reasons.yaml... seeded from onboarding.yaml.

Refining R (REASON) — why this UC exists
> "Underwrite commercial mortgage loans $1M-$50M against industry, geographic,
>  and policy constraints; produce a memo with citation grounding and route
>  to the appropriate approval authority."

Refining E (EVIDENCE) — what data sources
  ✓ borrower 10-K / 10-Q / audited financials  (existing pattern)
  ✓ AR aging                                    (existing)
  ✓ appraisal report                            (NEW: mortgage-specific)
  ✓ environmental site assessment               (NEW: real-estate-specific)
  Continue?

... [continues through A/S/O/N/S sections]

✓ reasons.yaml written
✓ schemas/ files seeded
```

### What to verify

```bash
# Canvas is internally consistent
grep -c 'NEW:' usecases/mortgage-origination/reasons.yaml   # should be ≤5
yamllint usecases/mortgage-origination/reasons.yaml          # should be clean
```

---

## Step 7 — `/fsi-build-parallel mortgage-origination` (~60-90 min)

Fan-out builders for the 5-step DAG. Spawns 6 sub-agents that build,
in parallel:

- Handler (Cloud Run + Pub/Sub push)
- Rules (per-UC rules)
- Each agent (5 specialists per the canvas)
- Sinks (use-case-specific destinations)
- Workflow YAML
- Tests (e2e + adversarial)

### What you'll see

```
$ /fsi-build-parallel mortgage-origination

→ planning DAG
  Layer 1 (foundation): handler, rules
  Layer 2 (agents): document-processor, analyst, rater, drafter, reviewer
  Layer 3 (orchestration): workflow, sinks
  Layer 4 (validation): tests, compliance pack

→ Layer 1 (parallel)
  · Building handler... ✓ (3 min)
  · Building rules...   ✓ (4 min — 1 net-new rule + 4 shared)

→ Layer 2 (parallel) - 5 agents
  · document-processor (from libraries/agents/document-processor@1.0)... ✓ (5 min)
  · analyst-multisection (from libraries/agents/analyst-multisection@1.0)... ✓ (6 min)
  · rater-with-covenant (from libraries/agents/rater-with-covenant@1.0)... ✓ (5 min)
  · narrative-drafter (from libraries/agents/narrative-drafter@1.0)... ✓ (7 min)
  · memo-reviewer-v2 (from libraries/agents/memo-reviewer-v2@1.0)... ✓ (4 min)

→ Layer 3 (sequential — needs Layer 1+2)
  · workflow.yaml (composing pipeline-originator + fragments)... ✓ (3 min)
  · sinks (gl-posting, document-store-gcs from existing)... ✓ (2 min)

→ Layer 4 (parallel)
  · tests/e2e... ✓ (4 min)
  · compliance pack (model_card.md, risk_assessment.md)... ✓ (5 min)

═══════════════════════════════════════════════════════════════
  Build complete — mortgage-origination
═══════════════════════════════════════════════════════════════
  Built  : 6 atomic units
  Reused : 6 atomic services + 5 agent archetypes + 4 shared rules + 6 workflow fragments
  Tests  : 23 unit, 8 integration, 1 e2e
  Time   : 1 hr 12 min
  Cost   : $4.20 (LLM) + $0.30 (Cloud Build)

Next: /review-uc mortgage-origination
```

### What to verify

```bash
# All required artifacts present
ls usecases/mortgage-origination/handler/main.py
ls usecases/mortgage-origination/agents/*.py     # 5 files
ls usecases/mortgage-origination/rules/*.json    # ltv_threshold_by_property_class
ls usecases/mortgage-origination/sinks/
ls usecases/mortgage-origination/workflow.yaml
ls usecases/mortgage-origination/tests/test_e2e.py

# Tests pass
cd usecases/mortgage-origination && pytest tests/
# Expect: green
```

### What can go wrong

- **One builder produces unparseable output.** The orchestrator captures
  the failure, retries once with a tighter prompt. If still fails, halts
  and surfaces the agent's last response so you can manually correct.
- **Two agents collide on a shared file** (rare — the worktree
  isolation usually prevents this). Resolve manually; the validators
  in Layer 4 will catch any inconsistency.

---

## Step 8 — `/review-uc mortgage-origination` (~10 min)

Multi-auditor review. Runs:
- architecture-auditor (5-step paradigm, no forbidden patterns, UX lockdown)
- security-reviewer (PII handling, IAM, secrets)
- compliance-reviewer (SR 11-7 pack completeness)
- test coverage check (≥90% on new code)
- reuse-rate check (re-verifies against current canvas)

### What you'll see

```
$ /review-uc mortgage-origination

→ architecture-auditor
  ✓ 5-step paradigm complete
  ✓ no forbidden patterns
  ✓ UX-first contract present, canvas_checksum matches
  ✓ archive trail intact at archives/design/mortgage-origination/20260510T142233Z/
  ✓ lock_level=full enforced

→ security-reviewer
  ✓ no PII in logs
  ✓ secrets via Secret Manager
  ✓ IAM least privilege
  ✓ prompt-injection defenses present in document-processor

→ compliance-reviewer
  ✓ model_card.md present + complete
  ✓ risk_assessment.md present + complete
  ✓ audit_trail_spec.md present
  ⚠ monitoring_plan.md is template-only (fill before /promote)

→ test coverage
  ✓ 94% line coverage on new code

→ reuse rate
  ✓ atomic 100%, agents 100%, rules 80%

Overall: PASS (1 warning)
  Warning: monitoring_plan.md still has TODO sections (acceptable for dev/staging;
  required for /promote to prod)

Next: commit + push, then /fsi-deploy mortgage-origination --env=dev
```

### What can go wrong

- **architecture-auditor FAILS with "UI files exist without locked design contract."**
  Your `decision.yaml` got deleted or the canvas SHA drifted. Re-run
  `/fsi-design-proposals` + `/fsi-design-review`.
- **security-reviewer FAILS on PII in logs.** Search `print(` and bare
  `logging.info(` in the diff; replace with the redacting logger.
- **compliance-reviewer FAILS on missing model_card.md.**
  `/fsi-build-parallel`'s compliance-pack builder failed. Run
  `/compliance-pack mortgage-origination` to retry.

---

## Step 9 — Commit + push (~2 min)

```bash
git add usecases/mortgage-origination/ onboarding/mortgage-origination.yaml \
        archives/design/mortgage-origination/

git status     # eyeball what's staged
git diff --stat HEAD    # eyeball line counts

git commit -m "$(cat <<EOF
feat: add mortgage-origination use case

Composes 6 atomic services + 5 agent archetypes + 4 shared rules + 1 new rule
(ltv_threshold_by_property_class per OCC Bulletin 2013-26). Pipeline console
pattern; 4 HITL gates; hybrid model provider (Anthropic primary, Vertex
fallback). UX locked to option C (inline-per-section affordance, full lock).

Reuse rate: atomic 100%, agents 100%, rules 80% — well above bank targets.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"

git push origin master
```

**The pre-commit hook re-runs the architecture-auditor.** If it blocks,
fix what it cites and re-commit (don't use `--no-verify`).

---

## Step 10 — `/fsi-deploy mortgage-origination --env=dev` (~10-15 min)

Deploys the UC's services + UI + workflow to GCP.

### What you'll see

```
$ /fsi-deploy mortgage-origination --env=dev

→ Terraform plan
  + 6 atomic service refs (reuse existing)
  + 1 new Cloud Run service (handler)
  + 1 new Cloud Workflow
  + 1 new Eventarc trigger
  + 1 new Pub/Sub topic (loans.mortgage-origination.submitted)
  + IAM bindings

  Apply? [y/N] y

  ... terraform apply ...

→ Cloud Build × 1 (handler image)
  ✓ pushed: us-central1-docker.pkg.dev/.../fsi-handler-mortgage-origination:latest

→ Cloud Run deploys × 1
  ✓ fsi-handler-mortgage-origination → https://...run.app

→ UI deploy
  ✓ Next.js standalone build
  ✓ pushed image
  ✓ fsi-ui-pipeline-console redeployed (now serves mortgage-origination routes)

→ smoke ping
  ✓ handler responds 200 on /health
  ✓ workflow executions API reachable

═══════════════════════════════════════════════════════════════
  Deployed — mortgage-origination (dev)
═══════════════════════════════════════════════════════════════
  Handler           : https://fsi-handler-mortgage-origination-...run.app
  Workflow          : projects/.../workflows/mortgage-origination
  Eventarc trigger  : loans.mortgage-origination.submitted
  UI                : https://fsi-ui-pipeline-console-...run.app (case routes auto-detected)
```

### What to verify

```bash
# Handler is reachable
curl -s "$(cat .fsi-state/mortgage-origination/handler.url)/health"
# Expect: {"status":"healthy"}

# Workflow is deployed
gcloud workflows list --location=us-central1 | grep mortgage-origination

# Send a test event
python3 scripts/demo_live_simulator.py --uc mortgage-origination --once --borrower BRW-LECO

# Watch it process
gcloud workflows executions list --workflow=mortgage-origination --limit=5
```

---

## Step 11 — First end-to-end smoke test (~10 min)

```bash
# Trigger one application
python3 scripts/demo_live_simulator.py --uc mortgage-origination --once \
  --borrower BRW-LECO --loan-amount 5000000

# Watch it in the UI
open "$(cat .fsi-state/mortgage-origination/ui-pipeline-console.url)/cases"

# Wait ~3 min for the workflow + agents to complete
# Refresh the UI; click into the new case

# Verify the chain
bash scripts/smoke_e2e.sh --uc mortgage-origination
# Expects: all stages green, memo populated, decision rendered, no synthesized=true
```

If anything is red, **don't paper over it**. Open the case in the UI, click
through every section, surface the failure. The factory has end-to-end
observability; the answer is in `application_events`, `application_artifacts`,
or `agent_invocations` in Cloud SQL.

---

## Step 12 — Promotion to staging (later)

```bash
/promote mortgage-origination --to=staging
```

The promotion gate checks:
- All compliance pack signatures present
- Cross-impact analysis (which other UCs share components and need re-testing)
- Latest review-uc verdict was PASS
- 7-day parity period in dev with the previous version

This is a separate workflow. Do not promote on day 1. Aim for a week
of dev-traffic shadowing before staging.

---

## Recovery procedures

### Resuming `/fsi-onboard` mid-journey

```bash
# Partial answers are saved
ls onboarding/mortgage-origination.partial.yaml
# Just re-run; the skill picks up where it left off
/fsi-onboard mortgage-origination
```

### Re-spinning designs

```bash
# Only allowed once
/fsi-design-proposals mortgage-origination --respin

# Reads your annotations from decision.yaml.partial, seeds 3 new agents
# (E, F, plus a re-run of one A-D under your constraints)
```

### Rolling back a UC (dev only)

```bash
# Tear down GCP resources
cd infra/dev && terraform destroy -target=module.uc_mortgage_origination

# Tear down design-proposal residue
bash scripts/cleanup_design_proposals.sh --uc mortgage-origination

# Delete the UC tree (LOCAL ONLY — never on master)
rm -rf usecases/mortgage-origination/
git checkout -- onboarding/mortgage-origination.yaml  # if you want to keep canvas
```

### Canvas drift detected mid-build

```bash
# Either: revert the canvas
git checkout onboarding/mortgage-origination.yaml

# Or: re-design (canvas changed = architecture changed = UX may be wrong)
/fsi-design-proposals mortgage-origination --redo
```

---

## Common pitfalls (with the cause and fix)

| Symptom | Cause | Fix |
|---|---|---|
| `/init-use-case` refuses with "no design contract" | You skipped `/fsi-design-proposals` | Run it, or pass `--skip-design --reason="<why>"` |
| `/init-use-case` refuses with "canvas drift" | Edited `onboarding/<uc>.yaml` after `/fsi-design-review` | Revert canvas OR re-run design proposals against the new canvas |
| `make test-all` red on a fresh clone | Setup incomplete | Check Day -1 prereqs (gcloud auth, dev.env, node version) |
| `/fsi-onboard` reuse gate blocks | You're proliferating | Go back to Round 4/Round 5; consolidate net-new shapes |
| `/fsi-design-proposals` 3+ agents fail compile | The mock-data.ts has a schema mismatch | Re-run `node scripts/generate_mock_canvas_data.mjs <uc>`; if persistent, the canvas references a non-existent shape — check library inventory |
| Cloud Build fails 4/4 for proposals | Probably a Dockerfile / monorepo build context issue | Compare against `ui/apps/pipeline-console/Dockerfile`; check `cloudbuild.yaml` substitutions |
| `/review-uc` "archive incomplete" | Files manually removed from `archives/design/<uc>/<TS>/` | `git checkout` them back; archives are forever |
| UI "pipeline is down" banner | Missing `FSI_<NAME>_URL` env vars on Cloud Run | Re-run `/fsi-deploy` — the URL discovery falls back to `.fsi-state/*.url` only in local dev |
| Agent output keeps failing schema validation | Vertex `response_schema` not actually wired | Verify the agent's manifest declares `response_schema_path`; check the orchestrator passes it through |
| HITL approvals hang | Eventarc subscription not subscribed to the right topic | `gcloud eventarc triggers list --location=us-central1`; verify the trigger's `transport.pubsub.topic` matches |

---

## Where to ask for help

- **Methodology questions:** `docs/methodology/README.md` then the auto-loaded skills.
- **Library inventory:** `/fsi-search-library "<intent>"` to find existing shapes.
- **Architecture review:** for net-new shapes or escape-hatches (skip-design, reuse-override).
- **Pre-commit hook blocked you:** read the message; it cites the rule by name. If you don't understand the rule, search `product-build-discipline.md`.

When in doubt: **ask a question rather than work around a gate.** The gates exist because of incidents we already paid for.

---

## TL;DR

```
gcloud auth login + source dev.env + Cloud SQL proxy running
       ↓
make test-all  (green = setup ok)
       ↓
read 5 methodology docs (30 min)
       ↓
/fsi-onboard <uc>             (45 min, 7 AskUserQuestion rounds)
       ↓
/fsi-design-proposals <uc>    (~30 min, mostly waiting; ~$7)
       ↓
/fsi-design-review <uc>       (15-20 min, click + pick + annotate)
       ↓
/init-use-case <uc>            (5 min, scaffold)
       ↓
/fsi-reasons-canvas <uc>       (10 min, refine business content)
       ↓
/fsi-build-parallel <uc>       (~75 min, parallel builders, ~$4)
       ↓
/review-uc <uc>                (10 min, full audit)
       ↓
git commit + push              (pre-commit hook re-audits)
       ↓
/fsi-deploy <uc> --env=dev     (~15 min)
       ↓
smoke test in browser + scripts/smoke_e2e.sh
```

End-to-end: 4-5 hours, ~$15 in LLM + Cloud Build, ~$0 in Cloud Run idle.
