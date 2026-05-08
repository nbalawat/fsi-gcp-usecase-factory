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
