# Product-build discipline — don't-repeat list

This document captures **lessons paid for in real incidents** during the
construction of `usecases/credit-memo-commercial`. Every lesson here was a
multi-hour or multi-day debugging session that should not happen again on
use cases #2 through #100.

The format for each lesson is deliberate:

- **Rule** — the one-line policy the next builder must follow.
- **Why (incident)** — the specific bug we hit. Without this, the rule
  decays into folklore in 6 months.
- **Framework question** — what the onboarding skill must ASK at scaffold
  time so this decision is made deliberately, not retrofitted.
- **CI gate** — the lint, test, or pre-commit check that enforces the rule.
  Words decay, gates don't.

When a rule has no gate, it is **aspirational**, not enforced. Aspirational
rules are flagged below and tracked as gaps to close.

---

## Index

| # | Theme                  | Rule (short) |
|---|------------------------|--------------|
| 1 | Model & provider       | Lock model provider + auth at scaffold time |
| 2 | Model & provider       | Constrain LLM structured output server-side, not just by prompt |
| 3 | Model & provider       | Stub fallback must be loud, never silent |
| 4 | Data & state           | No mock data past day 1 |
| 5 | Data & state           | Touch every backend service in the demo path |
| 6 | Data & state           | Schema is product, not glue (`application_state`, `application_events`, `application_artifacts`) |
| 7 | Data & state           | Idempotency guard on every async handler |
| 8 | Data & state           | Stash raw forensic data to debug events, not user-facing fields |
| 9 | Data & state           | Never dump intermediate state into user-facing artifacts |
|10 | Data & state           | Never truncate forensic outputs |
|11 | Data & state           | Synthesizer fallbacks must validate against the schema before writing |
|12 | UX                     | Loading / empty / error / populated states for every screen, every time |
|13 | UX                     | Live > polled > static (SSE for in-flight, no `setInterval(fetch)`) |
|14 | UX                     | Defensive UI everywhere — schema drift is real |
|15 | UX                     | SSE state changes trigger router invalidation, not polling |
|16 | UX                     | Hand-rolled formatters or pinned ICU — no `Intl.NumberFormat` for numbers in SSR |
|17 | UX                     | No technical-jargon leakage |
|18 | UX                     | Personas first-class from PR #1 |
|19 | UX                     | Every claim cites a source |
|20 | Deploy & ops           | Required env vars must hard-fail at boot |
|21 | Deploy & ops           | Cloud Run timeout sized to measured P99, not default |
|22 | Deploy & ops           | The simulator is the demo's life support |
|23 | Deploy & ops           | Don't keep editing while a deploy is in flight |
|24 | Contracts              | Atomic-service contracts have golden fixtures, not just types |
|25 | Contracts              | Risk-band / decision enums are canonical, coerced at the boundary |
|26 | Process                | UX bar is set on day 1, not retrofitted |
|27 | Process                | Document lessons, not project status |
|28 | Process                | The gates are the lessons — every rule paired with a CI check |
|29 | HITL & workflow        | One writer per state field — never let two services race on `application_state` |
|30 | HITL & workflow        | HITL action bars must `router.refresh()` after success and treat 404 as success-already-applied |
|31 | HITL & workflow        | Workflow writes `current_stage` at every major transition, not just HITL pauses |
|32 | UX                     | Default-tab logic is data-aware (no memo → "build" tab, not empty "Memo") |
|33 | UX                     | Per-application sessionStorage keys — never global, or one case poisons the next |
|34 | Contracts              | Vendor adapters: JSON-Schema-draft-07 → OpenAPI/Gemini-shape converter is mandatory |
|35 | Deploy & ops           | UI deploy: explicit Dockerfile + monorepo-root build context (not Buildpacks) |
|36 | Deploy & ops           | Service-URL discovery via env var FIRST, file fallback for local dev |
|37 | Eval & feedback        | Build the eval framework before optimizing prompts — no measurement, no improvement |

---

## 1. Lock model provider + auth at scaffold time

**Rule.** At `/new-use-case` scaffold time, the team chooses **one** model
provider per agent role (Vertex Gemini ADC, Anthropic API key, or both
behind a feature flag). The choice is recorded in `reasons.yaml` under
`Operations[i].provider` and matched by the orchestrator's call site.

**Why.** Mid-build, "I thought we are using google agent ADK" surfaced as
user feedback after we had already wired Anthropic-API calls everywhere.
We wasted hours on `sk-ant-oat` OAuth tokens that the Anthropic SDK rejects
(it requires `sk-ant-api`), then pivoted the entire orchestrator to
`google-genai` Vertex client. The pivot itself was clean; the wasted hours
were not.

**Framework question.** "Which model provider for each agent role —
**Vertex Gemini ADC** (recommended for GCP-native workloads), **Anthropic
API key** (long-context reasoning), or **both** with a feature flag? What
auth mechanism (ADC, key from Secret Manager, OAuth)? Region for
co-location with services?"

**CI gate.** `scripts/validate_use_case.sh` rejects any agent whose
`Operations[i].provider` field is missing or whose orchestrator call site
references a different SDK than the declared provider.

---

## 2. Constrain LLM structured output server-side, not just by prompt

**Rule.** Every agent that emits structured JSON consumed by downstream
code MUST set `response_schema` (Vertex Gemini) or the equivalent
constrained-decoding feature on its provider. Prompt-only constraint is
permitted only when the output is rendered as freeform prose.

**Why.** The memo-drafter agent kept inventing wrapper keys
(`credit_memorandum_draft`, `credit_memorandum`, `loan_memorandum`) and
alternative section names (`borrower_profile` instead of `text`,
`borrower_analysis` instead of `borrower_overview`, `recommendation:
{decision, summary}` instead of `recommendation_action`). Hardening the
prompt with explicit "DO NOT WRAP" rules **did not hold**. Multiple
"despite providing feedback this issue continues to exist" exchanges
followed. Only Vertex's server-side `response_schema` enforcement actually
prevented the drift.

**Framework question.** "Does any agent emit structured JSON consumed by
downstream code (orchestrator, sinks, UI parser)? If yes, list them — I'll
require `response_schema` on each call site."

**CI gate.** A new lint at `scripts/lint_agent_calls.py` greps every
`generate_content(...)` invocation in `services/orchestrator-*` and
`usecases/*/agents/*.py`; if the role is in the use case's
`structured_output_agents` list (declared in `reasons.yaml`) and the call
config does not include `response_schema`, the build fails.

---

## 3. Stub fallback must be loud, never silent

**Rule.** When an agent or atomic service falls back to a stub (missing
API key, provider unavailable, schema rejection), the fallback MUST: (a)
mark `synthesized: true` in the output, (b) write a structured warning log
with `reason`, (c) surface a banner in the UI ("DEGRADED — N of M agents
are stubbed"), and (d) fail the smoke test if the system is running with
any stub fallback active.

**Why.** When the Anthropic key was unset, all 13 agents silently fell
back to `_stub_agent_response()`. The orchestrator advanced normally, the
UI showed a "completed" case with fixture-grade memo content, and the user
spent hours unsure whether the demo was real. Silent degradation is worse
than an outright failure.

**Framework question.** "What's the stub-mode UX? When an agent or
service is unavailable, how does the underwriter know they are seeing
degraded output?"

**CI gate.** `scripts/smoke_e2e.sh` already asserts `stubs: 0` (added
2026-05-07). Promote that assertion to all use case e2e harnesses.
`tests/test_ui_smoke.mjs` checks for the presence of the `<DegradedBanner>`
component when the API returns `synthesized: true`.

---

## 4. No mock data past day 1

**Rule.** Within 72 hours of any UI page being committed, its data layer
MUST read from at least one deployed service (or a Cloud SQL row populated
by a deployed service). Static fixtures live only inside Storybook and unit
tests, never in app routes. `demo-data/scenarios/*.json` is forbidden as a
runtime data source.

**Why.** The original pipeline-console loaded
`usecases/credit-memo-commercial/demo-data/scenarios/*.json` from disk at
request time. It looked live to a stakeholder for one hour, then they
asked "show me the queue actually processing" and we couldn't — every
number on screen was static text. We tore the loader out, replaced it with
live SSE, and committed `lib/load-demo-data.ts → DELETED`.

**Framework question.** "What is your data layer at scaffold time —
**simulator publishing to deployed pipeline** (recommended), **live source
adapter**, or **fixtures (PoC only, expires in 72h)**? If fixtures, what
date does the fixture-removal commit ship?"

**CI gate.** Pre-commit hook checks `usecases/<uc>/ui/` for any import of
`demo-data/scenarios/*.json` if the use case manifest's
`data_source_at_committed: true` flag is set (toggled at the 72h gate).

---

## 5. Touch every backend service in the demo path

**Rule.** Every demo cycle MUST exercise every Cloud Run service listed in
the use case's `dependencies.yaml#produces` and `#consumes`. CI fails if
any service has zero `application_events` rows after a smoke run.

**Why.** Early demos exercised 3 of 8 atomic services. The first question
from a CCO was "what about the other 5?". A demo that touches everything
on the manifest answers itself.

**Framework question.** "Will the smoke test fire every atomic service on
every run? If a service is conditional (e.g. CRE concentration only fires
for real-estate-secured deals), declare it in `reasons.yaml` so the gate
expects the conditional behavior."

**CI gate.** `scripts/smoke_e2e.sh` asserts
`distinct(service_name) >= count(declared_unconditional_services)`. Already
implemented for credit-memo-commercial; promote to the use-case e2e
template.

---

## 6. Schema is product, not glue

**Rule.** The Cloud SQL tables that hold execution state
(`application_state`, `application_events`, `application_artifacts`,
plus any use-case-specific equivalents) are stable contracts. UI reads
from them. Services emit to them. Analytics queries them. Auditors examine
them. They are versioned in `infra/shared/schema.sql`, reviewed in PR,
migrated explicitly. They are NOT a place to dump random JSON the
developer is currently iterating on.

**Why.** When `application_state.decision` was sometimes `"APPROVE"` and
sometimes `"approve"` and sometimes `"Pass"`, the UI's filtering and the
analytics queries both broke. Migration to a coerced-at-boundary canonical
form took an hour we could have spent on UX.

**Framework question.** "What execution-state tables does this use case
need (typically `application_state` + `application_events`)? Are any
columns nullable for valid reasons or just because we haven't decided?"

**CI gate.** `infra/shared/schema.sql` is required reading in every
`/review-uc` run. Any new column in a state table without a default and
without a migration script is flagged.

---

## 7. Idempotency guard on every async handler

**Rule.** Every Pub/Sub push handler and every orchestrator entry point
MUST check the current state of the work item (e.g. `current_stage`) and
return `200 OK` with `skipped: true` if the item has already advanced past
the entry stage. Pub/Sub WILL redeliver. Without the guard, the full
pipeline runs twice, doubling cost and producing duplicate audit rows.

**Why.** A 3600s Cloud Run timeout combined with a 600s ack-deadline on
the subscription was correct; what was missing was the guard for the case
where the orchestrator finished in 3500s but Pub/Sub had already
redelivered at 600s. The duplicate run produced two memo artifacts, two
GL postings, two GCS documents.

**Framework question.** "What's the idempotency key for this use case
(typically `application_id` or equivalent)? What stage value indicates
'already-running, do not restart'?"

**CI gate.** `services/orchestrator-*/main.py` and
`usecases/*/handler/main.py` are linted for the presence of an early-exit
that reads `current_stage` (or the declared idempotency-state column) and
returns before invoking any expensive work.

---

## 8. Stash raw forensic data to debug events, not user-facing fields

**Rule.** When an agent's output cannot be parsed, when a service returns
an unexpected shape, when an LLM emits a non-conforming wrapper — the raw
output goes into `application_events` with `event_type` ending in
`_unparseable` or `_debug`. It does NOT go into `application_artifacts`,
it does NOT go into any column whose value renders in the UI.

**Why.** The orchestrator's synthesizer fallback wrote
`narrative = json.dumps(memo)[:4000]` and then put `narrative` into
`executive_summary.text`. Result: the user saw raw JSON
(`{"credit_memorandum_draft": {...}}`) rendered as a credit memo's
executive summary for a full day. Multiple "ultrathink fix" exchanges
later, the structural fix was: split forensics from user-facing.

**Framework question.** "When an LLM call fails to parse, where does the
raw output go? (Hint: not into the user's screen.)"

**CI gate.** Lint rule against `json.dumps(...)` appearing in any code
path that writes to a column whose name matches
`text|narrative|summary|description|body|message`.

---

## 9. Never dump intermediate state into user-facing artifacts

**Rule.** Banker-readable fields (`executive_summary.text`,
`risk_factors.factors[i].evidence`, `recommendation.narrative`) MUST be
banker prose, not serialized internal state. The synthesizer fallback,
when invoked, generates banker prose from real service outputs — it does
not copy-paste intermediate JSON into prose fields.

**Why.** Same incident as #8. Stated as its own rule because the failure
mode is broader than just `json.dumps` — any code path that takes
machine-readable state and writes it to a human-readable field is a bug
in waiting.

**Framework question.** "Which fields are banker-readable? Add a
`banker_readable: true` flag to those fields in
`schemas/<artifact>.schema.json`."

**CI gate.** A new validator at
`scripts/validate_artifacts.py` flags any artifact whose
`banker_readable` field starts with `{`, `[`, or contains a balanced
JSON-looking substring.

---

## 10. Never truncate forensic outputs

**Rule.** If an output must be capped (Pub/Sub message size, Cloud SQL
row limits), stash the full output to a sized-bucket location (GCS) and
store the URI in the row. Do NOT truncate with `[:N]` and call it done —
that destroys the artifact you'd need to debug.

**Why.** `narrative = json.dumps(memo)[:4000]` not only polluted the
user's screen but also made the original drafter output **unrecoverable**
when we tried to repair the case in-place. We had to rebuild the executive
summary from scratch using other (correctly-stored) sections.

**Framework question.** "What's your forensic-data size budget per
event? If individual outputs can exceed it, where's the GCS bucket for
overflow?"

**CI gate.** Lint rule against string slicing patterns
`[:NNNN]` applied to any value that flows into `application_events` or
`application_artifacts`. Allowed only with an explanatory comment
referencing this rule.

---

## 11. Synthesizer fallbacks must validate against the schema before writing

**Rule.** When the agent-drafted output fails to conform, the synthesizer
fallback MUST construct a schema-conformant object (validated against the
relevant `*.schema.json`) before writing to `application_artifacts`. A
non-conformant fallback is worse than no fallback — it puts the user in a
half-broken state with no recovery path.

**Why.** The original `_synthesize_memo_from_services` was permissive: it
emitted a half-formed memo and let the UI do its best. Result: 12 schema
errors per case, half the sections rendered as empty boxes, and the UI
fell back to the LECO fixture for "stub detection" cases — meaning every
fresh real run looked identical to the fixture.

**Framework question.** "If the agent output fails to parse, what does
the synthesizer fallback produce? Is its output validated against the
artifact schema before being written?"

**CI gate.** `services/orchestrator-*/main.py` is linted to ensure
`_validate_memo()` (or equivalent) is called on the output of every
synthesizer-fallback path, with errors logged but the fallback ALSO
asserting `errors == []` in the e2e smoke test.

---

## 12. Loading / empty / error / populated states for every screen, every time

**Rule.** Every shipped screen has all four states. No exceptions. There
is a UX acceptance checklist; a PR without all four states cannot merge.

**Why.** Multiple "the page is hung at Application Received and the
spinner is turning. Should I wait?" exchanges. The page wasn't hung — it
was in an unrendered loading state with no skeleton, no progress
indicator, no message. The user couldn't distinguish between "still
processing" and "broken".

**Framework question.** "For each screen, what does the user see when:
(a) data is loading, (b) the result is genuinely empty, (c) the API
errored, (d) the result is populated?"

**CI gate.** `scripts/test_ui_smoke.mjs` toggles a `?state=…` URL param
to inject each of the four states; visual-regression snapshots stored.
Pre-commit hook runs the smoke when any `ui/apps/*/app/**/page.tsx`
changes.

---

## 13. Live > polled > static

**Rule.** Any screen that displays in-flight work uses a push channel
(SSE, WebSocket). Polling (`setInterval(fetch, …)`) is allowed only for
screens that display reference data with a >5s update tolerance. Static
files are allowed only for never-changing reference data.

**Why.** The pipeline-console queue page initially polled `/api/cases`
every 5s. Three open tabs = 3× the load and 5s of stale UI per tab.
Switching to SSE collapsed three subscribers into one push channel and
the UI updates landed within 200ms of the DB write.

**Framework question.** "Does this screen display in-flight work? If yes,
the AppShell already provides `useLiveQueue` / `useLiveCase` /
`useLiveAuditTrail` — wire to those, not `useEffect(() => setInterval(…))`."

**CI gate.** `scripts/test_ui_smoke.mjs` greps for
`setInterval` in `ui/apps/*/app/**/*.tsx` and rejects matches without an
explanatory comment.

---

## 14. Defensive UI everywhere — schema drift is real

**Rule.** Every UI section component is wrapped in `<SectionErrorBoundary>`
that catches render-time exceptions and renders an inline notice with a
"Retry" button. Every `.map()` on agent-derived data uses `?? []`. Every
`.replace()` / `.startsWith()` / `.toFixed()` is null-safe.

**Why.** Multiple `TypeError: Cannot read properties of undefined`
crashes during the build. Every new agent output had subtle drift; the UI
assumed schema-perfection and crashed when it got close-but-not-exact.

**Framework question.** "Are sections wrapped in `<SectionErrorBoundary>`?
Have null-safety defaults been audited?"

**CI gate.** A new lint at `scripts/lint_ui_defensive.mjs` flags any
`.map(`, `.replace(`, `.startsWith(`, `.toFixed(` whose receiver is not
either (a) inside a try/catch (b) preceded by `?? []` / `?? ""` /
`Number(...)` coercion.

---

## 15. SSE state changes trigger router invalidation

**Rule.** Every Server Component page that displays state subject to
async updates includes a Client Component child that subscribes to SSE
and calls `router.refresh()` (Next.js) or equivalent on a debounced
state-change event. Pages that don't refresh are stuck pages.

**Why.** Multiple "the page is stuck at intake stage" exchanges. The case
had completed in the DB, the SSE stream had pushed the state change, but
the Server Component didn't re-fetch because nothing told it to.

**Framework question.** "Is each page that shows state subject to async
updates wired to `<CaseAutoRefresh>` (or your equivalent)?"

**CI gate.** Lint rule: every `ui/apps/*/app/**/page.tsx` that imports
from `lib/live-data.ts` must also include either a Client Component that
subscribes to SSE or a comment justifying why it's a one-shot snapshot.

---

## 16. Hand-rolled formatters or pinned ICU

**Rule.** Numbers and currency rendered by SSR must use either (a) a
hand-rolled formatter shared between server and client, or (b) `Intl.*`
APIs configured identically on both sides with a pinned ICU version.
Default `Intl.NumberFormat` differs across server (Node-bundled ICU) and
client (browser ICU) for compact notation; this WILL produce hydration
errors.

**Why.** "Server: $25.0M  Client: $25M" hydration mismatch. The fix was a
6-line `fmtUsd` helper, but finding the cause took 40 minutes.

**Framework question.** "What's your number / currency formatting
strategy? Is the formatter shared between server and client?"

**CI gate.** Lint rule against direct use of `new Intl.NumberFormat(...)`
in shared `ui/packages/components/`; only allowed in a designated
`lib/format.ts` that is imported by both server and client.

---

## 17. No technical-jargon leakage

**Rule.** User-facing text uses the user's vocabulary, not the platform's.
"5-step paradigm", "atomic services", "ADK agent" do not appear on a
credit officer's screen. The platform glossary is at `docs/glossary.md`;
UI strings are linted against it.

**Why.** The first credit-memo-commercial console showed "Step 4:
Drafting" and a credit officer asked "what's drafting? Are you drafting a
contract?". The answer was "the agent is writing the memo" — but the user
shouldn't have to ask.

**Framework question.** "What domain vocabulary does the user already
use? Add it to the use-case glossary; the smoke linter blocks the
platform's own nouns from leaking through."

**CI gate.** `scripts/test_ui_smoke.mjs` extends a per-use-case banned
words list (defined in `usecases/<uc>/ui/banned_terms.yaml`) and rejects
any matches in `app/**/page.tsx` strings.

---

## 18. Personas first-class from PR #1

**Rule.** Every FSI workflow has 3–5 distinct user roles (RM, analyst,
underwriter, CCO, compliance) with different home views and permissions.
The `persona-switcher` component and the `app/(persona)/...` route group
are scaffolded from the use case's first PR, not retrofitted.

**Why.** Adding personas to credit-memo-commercial after the underwriter
view was built took 3× longer than building personas first would have.
Every page had to be moved into a route group and audited for assumed
context.

**Framework question.** "How many user roles? List them now — I'll
scaffold the persona switcher and home views from the first PR."

**CI gate.** `/init-use-case` scaffolds the persona structure; the
template directory tree includes `app/(persona-1)/...` etc. for the
declared role count.

---

## 19. Every claim cites a source

**Rule.** Narrative output from any agent that lands in a regulator-
visible artifact (memo, recommendation, risk rating) must carry per-claim
citations in the schema. The UI surfaces them on hover/click. Audit
trails are non-negotiable for SR 11-7.

**Why.** Initial memo output had no citations. A CCO asked "where does
the 32% customer concentration claim come from?" and we had no answer.
Citation density of <80% is rejected by the memo-reviewer agent.

**Framework question.** "What's the citation contract for narrative
outputs? Per-claim or per-paragraph? Where does the source excerpt come
from (10-K page, peer-table row, regulation URL, atomic-service event)?"

**CI gate.** Schema validation enforces citation density ≥0.80 for every
artifact tagged `regulator_visible: true`. Already implemented for
credit-memo-commercial; promote to the use-case schema template.

---

## 20. Required env vars must hard-fail at boot

**Rule.** Every service validates its required environment variables at
startup. Missing or empty: log structured error, exit non-zero, never
serve traffic. Silent skip on `os.environ.get("VAR")` is a banned pattern.

**Why.** The dev server started with `GCP_PROJECT` unset. The Pub/Sub
publish silently no-op'd inside the credit-memo handler (because
`google-cloud-pubsub` falls back to logging when project is missing). The
result: the page was hung at "Application Received" with the spinner
turning. A 30-minute debugging session ended with the realization that
the simulator had been publishing to a void for an hour.

**Framework question.** "What env vars are required for boot? List them
now — I'll wire `_assert_env()` into `main.py` to hard-fail with a clear
error message."

**CI gate.** Lint rule: every `services/*/main.py` and
`usecases/*/handler/main.py` must call `_assert_env([...])` before
the first non-trivial import.

---

## 21. Cloud Run timeout sized to measured P99

**Rule.** Every long-running service declares `--timeout` in
`scripts/deploy_service.sh` based on its measured P99 + 50% headroom. The
default 540s is wrong for any service that calls multiple LLMs in
sequence.

**Why.** The orchestrator with 13 Gemini agents took 271s P99. With the
default 540s timeout, a slow run hit the wall and Cloud Run terminated
the request. Combined with no idempotency guard (#7), Pub/Sub redelivered
and we got duplicate work. The fix: `--timeout=3600s` plus the guard.

**Framework question.** "What's the longest service in this use case's
critical path, and what's its measured P99? I'll set `--timeout` to
P99 × 1.5."

**CI gate.** `scripts/deploy_service.sh` rejects deploys to services in
the `long_running_services` list that don't include an explicit
`--timeout`.

---

## 22. The simulator is the demo's life support

**Rule.** Every demo-grade use case ships with a simulator script
(`scripts/<uc>_simulator.py`) that publishes to the deployed pipeline at
a configurable cadence. The simulator doubles as a regression load-shape
test in CI.

**Why.** Demos that depend on a tester clicking buttons rarely impress.
The credit-memo demo needed a steady event stream so the audience could
watch the system process applications without a tour-guide narrating
every click. The simulator went from "nice to have" to "the only way the
demo holds together" within one rehearsal.

**Framework question.** "Does this use case need a demo simulator? If
yes, how many fixture profiles, what cadence, what scenario tags?"

**CI gate.** `scripts/<uc>_simulator.py` is referenced from
`reasons.yaml#demo_simulator`. CI runs it once per build with a fixed
seed and asserts the resulting case-trace matches a golden trace.

---

## 23. Don't keep editing while a deploy is in flight

**Rule.** When a `gcloud run deploy --source=…` is running, the source
tarball is uploaded at invocation time. Subsequent edits do NOT make it
into that revision. Wait for the deploy to finish, verify, then edit and
redeploy. Don't fan out three deploys in quick succession; that produces
log fragmentation across revisions.

**Why.** During the ultrathink fix, three orchestrator deploys went out
in 5 minutes because I made edits between deploys. Revision 00013 had
the wrapper unwrap; 00014 added the synthesizer fix; 00015 added the
response_schema. Tracking which fix was live in which revision was
unnecessarily confusing.

**Framework question.** N/A — this is process, not configuration.

**CI gate.** `scripts/deploy_service.sh` could optionally hash the source
tarball at submission and reject a re-deploy of the same hash within 5
minutes. Aspirational; not yet gated.

---

## 24. Atomic-service contracts have golden fixtures

**Rule.** Every atomic service ships with `tests/smoke_payload.json` —
the canonical request shape. The orchestrator's request-builder is
contract-tested against this fixture. A schema mismatch is caught at
unit-test time, not at runtime.

**Why.** `financial-spreader` expected flat keys (`revenue`, `ebitda`)
but the simulator sent multi-year (`{fy2023: {...}, fy2024: {...}}`). The
orchestrator's `_build_atomic_request` had to add a `_latest_fy()` helper
and remap keys. The fix was easy; it should have been caught by a
contract test before runtime.

**Framework question.** "Have you run the orchestrator's request-builder
against each atomic service's `smoke_payload.json` in a unit test?"

**CI gate.** A new test at
`services/orchestrator-*/tests/test_atomic_contracts.py` iterates every
atomic service in the use case's manifest, loads its smoke payload,
passes it through the orchestrator's request-builder, and asserts no
KeyError / no shape mismatch.

---

## 25. Risk-band / decision enums are canonical, coerced at boundary

**Rule.** Every enum (`risk_band`, `decision`, `recommendation_action`)
has one canonical form (`1-pass`, `APPROVE`, `approve`). Drafter agents
emit values constrained by `response_schema` (#2). The orchestrator
coerces incoming values to canonical at the boundary. Storage and UI use
the canonical form exclusively.

**Why.** The drafter at various points emitted "Pass", "1 - Pass",
"1-pass", "PASS", "Decline as Structured", "decline_conditional". Every
new variant broke a downstream consumer. The fix was a coercion table at
the orchestrator boundary plus the drafter's `response_schema.enum`.

**Framework question.** "List every enum-typed field in this use case's
schema. Confirm the canonical form, the boundary coercion, and the
`response_schema.enum` constraint."

**CI gate.** `scripts/validate_artifacts.py` checks every artifact field
that's enum-typed in the schema and rejects values outside the enum.

---

## 26. UX bar set on day 1, not retrofitted

**Rule.** The UX acceptance checklist (`docs/demo/ux-acceptance-checklist.md`)
is required from PR #1 of every UI page, not the last. Loading / empty /
error / populated states + motion + keyboard nav + density modes are not
"polish to add later"; they're the surface the user judges quality by.

**Why.** Multiple "it is very difficult to use the dashboard" exchanges.
Retrofitting polish costs 3× more than building it in. Each retrofit
broke other things and required re-testing.

**Framework question.** "Is the UX acceptance checklist linked from the
use-case spec? Is the first UI PR explicitly required to satisfy it?"

**CI gate.** PR template requires the UX checklist box checked for any PR
touching `ui/apps/`.

---

## 27. Document lessons, not project status

**Rule.** Every retro distills into 1–3 portable rules added to THIS doc.
Project-status notes (sleep reports, run logs, debugging breadcrumbs)
decay in days; principles compound. The doc is the artifact, not the
meeting notes.

**Why.** "What did I do last night?" is a worse question than "what rule
did the work prove?". Sleep reports stop being useful within 48 hours.
Rules in this doc are still useful in 2 years.

**Framework question.** N/A — process discipline.

**CI gate.** N/A — cultural.

---

## 28. The gates are the lessons

**Rule.** Every rule above is paired with a CI check, lint rule, or
pre-commit gate. Rules without gates are aspirational; gates are the
actual contract. When this doc grows, the gates table grows with it.

**Why.** Words decay. Tests don't. The lessons in this doc only matter
to the extent they're enforced; the moment a rule has no gate, it's a
recommendation, and recommendations are ignored under deadline pressure.

**Framework question.** "For each rule the team added to this doc this
quarter, what's the gate?"

**CI gate.** This doc has a self-test:
`scripts/lint_lessons_have_gates.py` parses the index table and the
`CI gate` lines in this doc; any rule whose gate is N/A or "aspirational"
is reported as a backlog item.

---

## 29. One writer per state field — never let two services race on `application_state`

**Rule.** For each column on `application_state` (current_stage, decision,
risk_band, dscr_base, …), exactly **one** service is the authoritative
writer. All other services either read or call the authoritative writer
through a queue.

**Why.** On credit-memo-commercial we ran the legacy `orchestrator-credit-memo`
service in parallel with Cloud Workflows v3 for "safety." Both subscribed
to the same Pub/Sub topic. Both wrote `decision=APPROVE` to
`application_state`. The legacy service stamped the decision early
(during enrichment, before any agents had run), and the case-detail page
showed "Approved · Case closed" while the workflow was still mid-flight at
`call_reviewer`. The user could not tell whether the case was actually
done. Hours of debugging traced to "two writers."

**Framework question.** "For each column on `application_state`, name
exactly one service that writes it. If two writers exist (parallel-run,
fallback, etc.), which one wins on conflict?"

**CI gate.** `scripts/lint_state_writers.py` greps for SQL `UPDATE
application_state` patterns across `services/` + `usecases/*/handler/`
and fails if more than one service writes a given column.

---

## 30. HITL action bars must `router.refresh()` after success and treat 404 as success-already-applied

**Rule.** Any client-side button that POSTs a workflow callback (HITL
extraction-review, rating-review, draft-review, final-approval) MUST:
1. Show a "✓ Submitted — workflow advancing…" confirmation chip in
   place of the button immediately on 2xx response.
2. Trigger `router.refresh()` ~600ms after the POST so the Server
   Component re-fetches state.
3. Treat HTTP 404 from the callback API as **success-already-applied**
   ("workflow already advanced — reloading…"), not as an error.

**Why.** Without #1+2 the user clicks "Approve," the button snaps back to
"Approve," nothing visible changes for 3-5s, the user clicks again, the
second click hits a checkpoint with no pending callback (workflow
advanced), gets a 404, gets a red error toast, and concludes the system
is broken. The first click was correct; the second was the user fighting
a stale UI. We paid for this on credit-memo-commercial; users hit
approve 2-3 times for every gate.

**Framework question.** "What's the explicit ACK after each HITL click?
Show me the confirmation chip + the refresh trigger."

**CI gate.** `scripts/lint_callback_handlers.py` parses every component
that POSTs to `/api/applications/*/callback/*` and asserts presence of
(a) `useRouter().refresh()` call, (b) a `done` state branch in the
component, (c) a 404-as-success branch in the fetch handler.

---

## 31. Workflow writes `current_stage` at every major transition, not just HITL pauses

**Rule.** A Cloud Workflow that drives a multi-step lifecycle MUST POST
to `audit-writer/state` with the new `current_stage` value at the
START of each major step (analyzing, spreading, rating, drafting,
reviewing, posting), not only when it pauses at HITL gates.

**Why.** On credit-memo-commercial v3, the workflow only wrote
`current_stage` at HITL pauses (extraction_review, rating_review,
draft_review, approval). Between HITL gates, the stage stayed stuck on
the prior pause's value. So while the drafter agent was running for
60-90s, the case page kept showing "Awaiting your rating review · 89s
in this stage" even though the workflow was already past that point.
The user couldn't tell whether the workflow was running, paused, or
broken.

**Framework question.** "List every long-running step (≥10s) in the
workflow. For each, what stage value does the UI show while it runs?"

**CI gate.** `scripts/lint_workflow_stages.py` parses
`usecases/<uc>/workflow*.yaml` and fails if any step with `timeout >
10s` is not preceded by a stage-update step.

---

## 32. Default-tab logic is data-aware (no memo → "build" tab, not empty "Memo")

**Rule.** Multi-tab case-detail pages MUST compute their default tab
from the data state, not hardcode it.
- If a primary artifact exists (memo, recommendation, decision) →
  default to that tab.
- Otherwise → default to a tab that shows live progress (pipeline
  activity, processing panel) so the user sees motion, not a static
  "60-90s" message.

**Why.** Credit-memo-commercial defaulted every case to the "Credit
memo" tab. While the workflow was mid-run, this tab showed an empty
state with "Drafting…". Users assumed the page was stuck. Switching
the default to the "How it was built" tab when no memo existed
restored "I can see what's happening" within one render.

**Framework question.** "For each tab on your case-detail page, in
which states is its content meaningful? What's the default when each
tab's content isn't there yet?"

**CI gate.** `scripts/lint_case_tabs.py` requires the case page's
default-tab expression to reference at least one piece of case data
(memo, decision, stage), not a string literal.

---

## 33. Per-application sessionStorage keys — never global, or one case poisons the next

**Rule.** Any client-side preference that varies by case (selected
tab, density mode, expanded section, sort order on the queue, …) MUST
key its sessionStorage / localStorage entry by the entity id —
`<feature>.<applicationId>` or `<feature>.<userId>`. Global keys cause
state from one entity to leak into another.

**Why.** The case-detail tabbed shell stored "active tab" under a
single global key `case-tab.active`. User opens case A (done, default
"memo"), it persists. User opens case B (in-flight, defaulted to
"build" by rule 32) — sessionStorage forces it back to "memo," they
land on the empty memo screen. Switching to a per-application key
fixed it instantly.

**Framework question.** "List every sessionStorage / localStorage key
your UI sets. Which are entity-scoped? If a key is global, is it
genuinely a per-user preference?"

**CI gate.** `scripts/lint_storage_keys.py` greps for
`sessionStorage.setItem` / `localStorage.setItem` and reports any key
that looks entity-bound (contains "case", "loan", "app", "borrower",
"id") but doesn't include a variable in the key.

---

## 34. Vendor adapters: JSON-Schema-draft-07 → OpenAPI/Gemini-shape converter is mandatory

**Rule.** When passing a JSON Schema to a vendor SDK that expects
OpenAPI 3.x shape (Vertex Gemini `response_schema`, OpenAI `json_schema`,
others), the schema must be **converted**, not handed through directly.
The converter handles:
- `type: ["X", "null"]` (draft-07 nullable) → `type: "X", nullable: true`
- Drop unsupported keywords (`$schema`, `$id`, `additionalProperties`,
  some `format` strings, `oneOf` unions)
- Recurse into `properties` + `items`

**Why.** On the LiteParse+Gemini fallback vendor for the
document-extractor we passed our `10K.json` JSON Schema directly to
`google-genai`. The SDK errored: `'list' object has no attribute
'upper'` — it tried to uppercase the type name and choked on the
`["number", "null"]` array. Two extractions failed with cryptic
errors before the converter landed. See
`services/atomic/document-extractor/vendors/liteparse_gemini.py:_jsonschema_to_gemini`.

**Framework question.** "For each vendor SDK that accepts a schema,
which schema dialect does it expect? Is your schema in that dialect or
do you need an adapter?"

**CI gate.** `scripts/lint_vendor_schemas.py` walks every call site
that passes `response_schema` to `google-genai` / `anthropic` /
`openai` and asserts the schema source is either inline-OpenAPI or
piped through a converter function (no raw `.json` file load).

---

## 35. UI deploy: explicit Dockerfile + monorepo-root build context (not Buildpacks)

**Rule.** Any non-trivial Next.js app (one that imports across pnpm
workspaces, uses `@uc/*` aliases pointing outside `app/`, or needs
`output: "standalone"`) MUST deploy via:
1. A `Dockerfile` at `<app>/Dockerfile`
2. A `cloudbuild.yaml` at `<app>/cloudbuild.yaml` that references the
   Dockerfile with `--file`
3. Build context = **repo root** (so Dockerfile sees both the workspace
   root AND any sibling dirs the app imports from, e.g. `usecases/`)
4. `gcloud builds submit . --config <app>/cloudbuild.yaml` then
   `gcloud run deploy --image <pushed-tag>`

Do NOT use `gcloud run deploy --source` for these apps — it triggers
Buildpacks, which doesn't see your Dockerfile in a subdirectory and
also doesn't understand pnpm workspaces.

**Why.** First UI deploy attempt used `gcloud run deploy --source ui`.
Buildpacks couldn't find the workspace lockfile, couldn't resolve
`@fsi-bank/components`, and silently failed. Burned 30 minutes
diagnosing before switching to explicit Dockerfile.

**Framework question.** "Where does this app's Dockerfile live? What's
the build context? If it imports from outside its own dir, does the
context include those dirs?"

**CI gate.** `scripts/lint_ui_deploy.py` enforces that every
`ui/apps/*/` dir has a `Dockerfile` AND `cloudbuild.yaml`, and that the
cloudbuild.yaml uses `--file` pointing at the Dockerfile (not letting
docker auto-detect at the build context root).

---

## 36. Service-URL discovery via env var FIRST, file fallback for local dev

**Rule.** Any code that needs a deployed service's URL (live-status
indicator, integration tests, agent runtime config) MUST resolve it via:
1. Environment variable `FSI_<SERVICE_NAME>_URL=https://...` —
   primary path; works in Cloud Run / production / CI
2. `.fsi-state/<service>.url` file fallback — local dev only;
   excluded from container images via `.dockerignore`

Code that ONLY reads from `.fsi-state/` will run fine on the dev
machine and silently fail on Cloud Run.

**Why.** First UI deploy showed "Pipeline down · 0/10 services up" on
the homepage. The `/api/live` endpoint read `.fsi-state/*.url` files
that exist in the dev workspace but are correctly excluded from the
Docker image. The fix was a two-tier resolver (env first, file
fallback). See `ui/apps/pipeline-console/app/api/live/route.ts:resolveServiceUrl`.

**Framework question.** "List every place your code reads a service
URL. For each: does it work in Cloud Run? Have you tested it there?"

**CI gate.** `scripts/lint_service_url_lookups.py` greps for
`.fsi-state/` references in `**/app/**`, `**/services/**`, and any
runtime code path. Any reference must be guarded by a prior env-var
check.

---

## 37. Build the eval framework before optimizing prompts — no measurement, no improvement

**Rule.** Before rewriting an agent prompt to "improve depth /
accuracy / grounding," there MUST be:
1. A baseline eval run with structural scorers (deterministic) +
   LLM-judge scorers (probabilistic)
2. A `scripts/eval_diff.py` (or equivalent) tool that compares two
   eval-run JSON files and prints per-scorer deltas
3. A scoreable result on at least 3 representative borrowers / cases

Then change the prompt. Then re-run evals. PRs that touch agent prompts
without eval deltas are rejected.

**Why.** Without evals, prompt changes are guesses. We added a
"required citations per section" rule to the drafter prompt and didn't
know if it actually moved citation density until we built
`evals/scorers/structural.py:score_section_completeness` and ran it
against a "before" + "after" memo. Score went 2.5/5 → 4.5/5 — change
shipped. Without measurement, every prompt edit is a maybe.

**Framework question.** "What evals will measure whether your next
prompt change improved or regressed quality? Is there a baseline
already captured?"

**CI gate.** `scripts/lint_prompt_evals.py` runs on every PR that
touches `usecases/*/agents/prompts/*.md`. It requires at least one
modified file under `evals/` (new or updated golden case, scorer, or
result JSON) in the same PR.

---

## 38. Design proposals are self-contained Next.js apps — never inherit from a host shell

**Incident.** Tier-1 designer agents produced Dockerfiles that built
`ui/apps/pipeline-console` with the `@uc/*` alias rewritten to point at
each option's source. The result:
- Options A/B/C "built" but the alias rewrite didn't actually swap content
  for the routes pipeline-console mounts, so all three Cloud Run URLs
  served the **production credit-memo UI**, not their unique designs.
  $8 of LLM spend on 4 distinct designs that never showed up to a visitor.
- Option D's Dockerfile did try to override the alias correctly, but
  pipeline-console pulls in `app/(cco)/portfolio/page.tsx` etc. that
  import `@uc/components/cco/*` — files that exist in
  `credit-memo-commercial` but not in option-D. Build failed at
  webpack.

The piggy-back pattern is structurally wrong: every option needs to
ship the routes it owns AND have all unused parent routes removed.
That's impossible to do reliably with a path-alias hack.

**Rule.** Every design proposal generated by `/fsi-design-proposals`
ships as a **fully self-contained Next.js app**: its own `package.json`,
`next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `app/globals.css`,
and `Dockerfile`. The Dockerfile vendors shared workspace packages
(`@fsi-bank/components`, `@fsi-bank/theme`) at COPY time and resolves
them via tsconfig path mapping. No piggy-back on pipeline-console.
No alias override hacks.

**Why.** A self-contained app is the only build pattern that:
- Compiles in isolation (no host-shell route pollution)
- Lets each option ship ONLY its own routes
- Proves the option's UX at the URL, not just in source

**CI gate.** `scripts/lint_ui_design_standards.mjs` Rule 3 enforces
AppShell-rooted pages PER OPTION. The auditor refuses to record a
`decision.yaml` whose chosen option lacks `package.json` + `next.config.mjs`
+ `Dockerfile` at the option root.

---

## 39. Cloud Build YAML — escape shell `$VAR` references as `$${VAR}` in inline scripts

**Incident.** `infra/templates/design-proposal-cloudbuild.yaml` had inline
`bash -c` steps using `$SERVICE`, `$IMAGE`, `$URL`. Cloud Build's
substitution parser pre-validates the YAML and rejected the template with:

```
ERROR: (gcloud.builds.submit) INVALID_ARGUMENT: invalid value for
'build.substitutions': key in the template "SERVICE" is not a valid
built-in substitution
```

The parser is greedy: any `$VAR` that doesn't resolve to a known
built-in (`$PROJECT_ID`, `$BUILD_ID`, etc.) or declared substitution
(`$_FOO`) is an error. Cost 4 build retries to diagnose; ~$0.10.

**Rule.** In Cloud Build YAML inline scripts:
- Cloud Build substitution: `${_USE_CASE}`, `${PROJECT_ID}` — single `$`
- Shell variable: `$${VAR}` — double `$$` escape

```yaml
- name: gcr.io/google.com/cloudsdktool/cloud-sdk
  entrypoint: bash
  args:
    - "-c"
    - |
      SERVICE="my-${_OPTION}-service"
      gcloud run deploy "$${SERVICE}" --image="$${IMAGE}" ...
```

**CI gate.** New: `scripts/lint_cloudbuild_substitutions.mjs` greps
`infra/templates/*.yaml` for bare `$[A-Z_]+` inside `args:` blocks and
fails if any unescaped match isn't a documented built-in. Plus the
factory's `/fsi-deploy` skill runs a dry-run validation against any
cloudbuild template before submitting.

---

## 40. Factory bootstrap creates all GCS buckets the templates reference

**Incident.** `design-proposal-cloudbuild.yaml` declares
`artifacts.objects.location: gs://${PROJECT_ID}-fsi-design-build-artifacts/...`.
The bucket didn't exist. First build run failed at the artifacts step.
~5 min wasted diagnosing + creating.

**Rule.** Every GCS bucket referenced by a Cloud Build template,
Eventarc trigger, or service must be created in
`infra/shared/cloud_sql.tf` (or equivalent shared infra) — not assumed
to exist. The factory's `/init-use-case` step 0 (or `/fsi-deploy --bootstrap`)
verifies bucket presence before any build submission.

**CI gate.** `scripts/check_required_buckets.sh` (NEW) — fans out
across `infra/templates/*.yaml` + every UC's `workflow.yaml` + all
cloudbuild.yaml files, extracts every `gs://` reference, and confirms
the bucket exists for the active project. Runs in `/review-uc` and
`/fsi-deploy --pre-flight`.

---

## 41. Cloud Run `--allow-unauthenticated` is best-effort; org policy may override

**Incident.** Design-proposal services deployed with `--allow-unauthenticated`
in the cloudbuild template. Unauthenticated `curl` returned 403. Reason:
the bank's GCP org has Domain Restricted Sharing (DRS) policy that
silently strips `allUsers` IAM bindings on Cloud Run services.

**Rule.** For services that must accept anonymous traffic in dev/staging
(design proposals, ephemeral preview URLs):

1. Don't rely on `--allow-unauthenticated`. Add an explicit IAM allUsers
   binding AS A SEPARATE STEP after deploy:
   ```bash
   gcloud run services add-iam-policy-binding "$SERVICE" \
     --member=allUsers --role=roles/run.invoker \
     --region=$REGION
   ```
2. If the binding silently fails (DRS), the service emits a clear log
   line — surface it in the deploy summary.
3. For Playwright validation against authenticated services, supply an
   OIDC token in the Playwright `extraHTTPHeaders`:
   ```js
   const token = process.env.OIDC_TOKEN;  // from gcloud auth print-identity-token
   await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
   ```
4. The factory's `validate_with_playwright.mjs` accepts `--oidc-audience`
   and `--oidc-token` for this case.

**CI gate.** `scripts/check_design_proposal_iam.sh` — for every deployed
design-proposal service, verifies either allUsers is bound OR Playwright
ran with OIDC and the auditor sees the token-bearing artifact.

---

## 42. Designer prompts must ENUMERATE shared primitives — never describe them abstractly

**Incident.** The original `/fsi-design-proposals` designer prompt told
each agent "import shared primitives from `ui/packages/components/`
wherever possible" without listing what those primitives ARE. Option A's
agent invented `<ExecutiveHeader>` instead of using `<AppShell>`. Three
other options used `text-[96px]` and other Tailwind arbitrary values
because the prompt said "use the Atrium token system" without naming
which tokens existed. 14 lint violations across 4 options. The judge
LLM caught them, but only AFTER $1.50/option × 4 = $6 of inference cost.

**Rule.** Designer agent prompts ENUMERATE the available primitives by
name, width budget, and "don't" guidance — verbatim copy-paste from
`ui-standards.md` Section 2. Don't trust the agent to read the doc; bake
the table into the prompt. Same discipline for design tokens (color
ramp, type ramp, spacing) — list them, don't reference them.

The prompt MUST list:
- Every primitive name + import path + when-to-use + width budget
- Every hard rule that will block at lint time (AppShell-rooted,
  no arbitrary Tailwind values, no `<div onClick>`, etc.)
- The exact path to the canvas SHA and the read-only mock-data module

**CI gate.** The smoke test asserts the designer prompt cites
`ui-standards.md` Section 2 by name AND enumerates ≥10 primitive names
inline. If `ui/packages/components/` grows and the prompt doesn't, smoke
fails.

---

## 43. Boolean fields the auditor / comparator gates on must be EXPLICITLY stamped — never inferred

**Incident.** The design-proposal comparator's "build failed" panel
state was triggered by `manifest.build?.build_succeeded === undefined`.
Designer agents don't stamp `build_succeeded` (they don't run the build).
The post-agent gates only stamp `reuse_floor_met` + `a11y_violations`.
Result: every panel rendered "⚠ build failed" even though the gates
passed. Took a live-browser Playwright run to surface this; 100 builders
would have shipped a comparator that lied about every option's status.

**Rule.** Any boolean field that drives a UI gate or auditor decision
must be set EXPLICITLY by the script that proves it true (or false).
Never infer from `undefined`. Either:

```js
// WRONG — undefined treated as failure
if (!manifest.build?.build_succeeded) showFailed();

// RIGHT — only explicit false is failure
if (manifest.build?.build_succeeded === false) showFailed();
// AND the gate that proves success MUST stamp it:
upsertBuildField(manifestPath, "build_succeeded", true);
```

This applies to every `manifest.yaml` boolean: `reuse_floor_met`,
`hitl_gates_wired`, `build_succeeded`, `deploy_succeeded`,
`playwright_validated`, etc.

**CI gate.** The smoke test rendering fixtures must NOT set
`build_succeeded` at all — the comparator should display the empty
state, not the failed state, when the gate hasn't run. Plus
`lint_ui_design_standards.mjs` rule 4.10 (defensive UI) flags
`!foo?.bar` patterns where `false` is conflated with `undefined`.

---

## 44. Same-axis designer variance is high; rely on the OBJECTIVE Jaccard, not the LLM judge

**Incident.** Tier 3 variance test (same canvas, 2 runs, same axis seeds):

| Axis | Judge LLM verdict | Meta-comparator Jaccard | Ground truth |
|---|---|---|---|
| density (A) | "consistent" (jaccard 0.55) | 0.18 | chaotic |
| metaphor (B) | "consistent" (jaccard 0.65) | 0.30 | drifting |
| affordance (C) | "consistent" (jaccard 0.55) | 0.20 | chaotic |
| wildcard (D) | "drifting (acceptable)" | 0.38 | drifting |

The LLM judge reads component names semantically — `<DecisionHero>` and
`<ExecutiveDecisionCard>` feel similar so it scores high. The
meta-comparator computes exact-string Jaccard — they're different
strings, so it scores low. The script is the ground truth.

**What this means.** A given seed produces a CONSISTENT DESIGN PHILOSOPHY
across runs (judge confirms) but the AGENT INVENTS DIFFERENT COMPONENT
NAMES each time. For 100 builders running the same UC, this means:
- Two builders running /fsi-design-proposals on the same canvas get
  options A that share design philosophy but share <30% of components
- The locked decision.yaml at builder #1's pick won't reuse cleanly
  if builder #2 promotes the same option from a fresh run
- The factory's reuse-floor gate (≥5 shared from ui/packages/) is
  the actual stabilizer — different agents land on different mixes
  of the SAME 14 shared primitives, so the underlying chrome is
  consistent even when option-specific component NAMES drift

**Rule.** Decisions that depend on COMPONENT IDENTITY across runs (e.g.
"all UCs that picked option-A should share the same DecisionHero
component") cannot be made on agent output alone. Either:

1. **Accept the variance** — the design PHILOSOPHY is consistent
   (which is what the picker actually cares about); the component
   *names* are local to each run. This is the default position.
2. **Promote winning components to libraries/components/** — once an
   option is picked and lives in a real UC, the platform team can
   identify components that should be platform-level and migrate them.
   `/fsi-promote-to-library` handles this for agents; needs an
   equivalent for UI components.
3. **Pre-define component names in the canvas** — the designer prompt
   already enumerates 14 shared primitives by name. Extending to
   "every option must use named components from THIS list of N for
   the hero, M for the right-rail" reduces variance at the cost of
   designer creativity.

For the V1 factory, option 1 (accept) is the right call. Option 2 is
the natural follow-up after UC #3 ships.

**CI gate.** `scripts/build_meta_comparator.mjs` already computes the
ground-truth Jaccard and writes it to `archives/design-tests/_meta/<ts>/analysis.json`.
`/review-uc` reads this and flags ANY UC whose chosen-option's same-axis
Jaccard against the previous run on the same canvas is below 0.5 — not
to block, but to surface the variance in the reviewer's feed.

---

## How to use this doc

**At scaffold time** — `/new-use-case` includes a step that reads the
"Framework question" lines from this doc and asks the team to answer each
relevant one. Decisions are recorded in `reasons.yaml` so they can be
audited later.

**At review time** — `/review-uc` runs every gate listed above as part
of the static-checks pass. Failed gates block promotion.

**At retro time** — every quarter, the platform team adds new rules to
this doc based on incidents from the prior 90 days. Each rule gets a
gate before the entry can land in `master`.

**For new builders** — read this doc in full before starting your first
use case. The questions in `/new-use-case` Step 2 won't make sense
without the incident context here.
