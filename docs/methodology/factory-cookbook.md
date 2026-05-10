# Factory cookbook — patterns proven on credit-memo-commercial

This is the **forward-looking** companion to `product-build-discipline.md`.
That doc tells you what NOT to do (rules + CI gates). This one tells you
what TO do — the architecture patterns we battle-tested on credit-memo-commercial
that should be the default starting point for the next use case.

If you're scaffolding use case #2, #3, or #N, read this end-to-end before
writing any code. Each pattern below points at a working reference
implementation; the cost of reusing one of these is typically a few hours
of integration vs. one to two weeks of independent discovery.

---

## Pattern 1 — HITL via Cloud Workflows callbacks

**Use it when** the lifecycle has decision gates a human must clear
(extraction review, risk-band override, draft review, final approval).

**Don't roll your own** state machine; Cloud Workflows v3 has
`events.create_callback_endpoint` + `events.await_callback` that does
the right thing.

**Reference**:
- Workflow YAML: `usecases/credit-memo-commercial/workflow.v3.yaml`
  (search for `await_extraction_review`, `await_rating_review`,
  `await_draft_review`, `await_final_approval`)
- Callback URL persistence: `services/audit-writer/main.py:_handle_callback_register`
  writes to `application_state.pending_callbacks` JSONB
- API forwarder: `ui/apps/pipeline-console/app/api/applications/[id]/callback/[checkpoint]/route.ts`
  mints OAuth-2 access token (NOT OIDC — workflowexecutions.googleapis.com
  refuses OIDC), forwards to the workflow's callback URL
- UI action bar: `usecases/credit-memo-commercial/ui/components/checkpoint-actions/checkpoint-action-bar.tsx`

**Mandatory ergonomics** (Rule 30): action bar shows confirmation chip
on success, calls `router.refresh()`, treats 404 as success-already-applied.

**Common gotchas**:
- Cloud Workflows expression language doesn't accept `{}` literal inside
  `${...}`. Use a pre-init `assign` step.
- `parallel.shared` variables must be declared BEFORE the parallel block.
- Callback URLs require **OAuth 2 access tokens**, NOT OIDC ID tokens.
  `googleAuth().getAccessToken()` not `idTokenFor()`.
- `events.await_callback` result shape is
  `${result.http_request.body.<field>}` — verified empirically; some
  docs show different paths.

---

## Pattern 2 — Three-pane case shell with data-aware tabs

**Use it when** a case detail page has multiple primary surfaces (the
artifact / a workbench / source documents / pipeline activity / rules /
audit).

**Reference**: `usecases/credit-memo-commercial/ui/components/case-shell/case-tabbed-shell.tsx`

```
┌──────────┬─────────────────────────────────┬────────────────────┐
│ NAV      │ ACTIVE TAB CONTENT              │ DECISION RAIL      │
│ ▣ Memo   │  (one of N panels)              │  Risk · Decision   │
│ □ Spread │                                 │  OCC clock         │
│ □ Docs   │                                 │  Stats             │
│ □ Rules  │                                 │  Source docs list  │
│ □ Build  │                                 │                    │
└──────────┴─────────────────────────────────┴────────────────────┘
[ HITL ACTION BAR — sticky bottom of viewport, all tabs ]
```

**Mandatory** (Rules 32 + 33):
- `defaultTabId` is data-aware: when the primary artifact doesn't exist
  yet, default to a tab that shows live progress, not the empty
  artifact.
- sessionStorage key is **per-application_id**:
  `case-tab.active.<applicationId>`. NEVER global.
- HITL action bar is sticky-positioned at bottom of viewport so the
  next required action is always visible.

**Plumb-through props**:
- `applicationId` → for sessionStorage key
- `defaultTabId` → computed from data state (e.g. `memoExists ? "memo" : "build"`)
- `pendingCheckpoints[]` → from `application_state.pending_callbacks`
  keys, so the action bar self-hides when no callback is registered

---

## Pattern 3 — Multi-doc upload with auto-detect

**Use it when** the use case takes multiple documents per case (10-K +
10-Q + AR aging + appraisal + …).

**Reference**: `usecases/credit-memo-commercial/ui/components/document-upload/multi-doc-upload.tsx`

**Features:**
- Drag-and-drop multiple PDFs at once → each becomes a row
- File-name → doc_type heuristic (`10K_FY2023.pdf` → `10-K`,
  `audited_financials.pdf` → `audited_financials`, etc.)
- Per-row override dropdown for when the heuristic gets it wrong
- Dedupe by (filename, size) — dropping the same file twice is a no-op

**API contract**: `POST /api/applications` with multipart
- `metadata` field: JSON with borrower_id, loan_amount_usd, naics_code, etc.
- `documents` field: JSON array of `[{field: "file_0", doc_type: "10-K"}, ...]`
- `file_0`, `file_1`, ... fields: the actual PDF binaries

Returns `{application_id, doc_count, redirect_url}`.

---

## Pattern 4 — Document extraction with vendor abstraction

**Use it when** you need PDFs → structured fields with citations.

**Reference**: `services/atomic/document-extractor/`

**Abstraction**: `vendors/__init__.py` selects vendor by env var
`DOC_VENDOR=landing_ai|liteparse_gemini|stub`. Each vendor implements
`extract(pdf_bytes, doc_type, extraction_schema) → VendorResult`.

**Vendors built**:
- `landing_ai.py` — production path; ADE Parse + Extract; native chunk
  references with bbox; HTTP 422 on PDFs >100 pages.
- `liteparse_gemini.py` — fallback; pypdf for parse + Vertex Gemini for
  schema extraction + substring-match for best-effort citations. Lower
  fidelity but always available.
- `stub.py` — for tests; reads a JSON fixture.

**Mandatory** (Rule 34): the LiteParse fallback MUST convert
JSON-Schema-draft-07 → Gemini-shape via `_jsonschema_to_gemini`. Without
this you'll hit `'list' object has no attribute 'upper'` from the SDK.

**Mandatory**: `ExtractResponse` carries `raw_markdown` (max 60K chars)
so downstream agents can write rich commentary, not just regurgitate
fields.

---

## Pattern 5 — JDM rules with `/evaluate_all` + per-rule events

**Use it when** the use case has regulatory + policy rules that should
run on every case as a deterministic gate.

**Reference**: `services/rules-service/main.py`

**Two endpoints**:
- `POST /` — single rule, `{context_id, rule_set, inputs}` → result
- `POST /evaluate_all` — batch: `{application_id, service_results,
  documents, ...ctx}` → loops a rule catalog, builds inputs per rule,
  writes one `application_events.rule_evaluated` row per rule (including
  SKIP/ERROR), returns merged results

**Catalog pattern**: each rule has an entry `(rule_set_name,
build_inputs_fn)`. The build function takes `(service_results, ctx,
documents)` and returns the JDM input dict OR `None` (skip).

**Loader supports both layouts**:
- `rules/<rule_set>.json` (flat)
- `rules/<rule_set>/v<N>.json` (versioned dir — preferred; pick highest version)

**Input fallbacks**: builders compute ratios from
`documents[i].extracted_fields` when atomic-service outputs aren't
available. Lets rules run before the full Stage-3 chain is wired.

**Disclosure surface**: `usecases/credit-memo-commercial/ui/components/rules/rules-table.tsx`
renders one card per rule_evaluated event with rule name, citation,
description, decision badge, inputs, outputs, reason. SR 11-7 ready.

---

## Pattern 6 — Auto-grounding memo sections from extraction citations

**Use it when** an LLM agent emits structured output with `citations[]`
arrays per section that the agent sometimes leaves empty even when
source citations are available.

**Reference**: `usecases/credit-memo-commercial/ui/lib/auto-ground-memo.ts`

**Mechanism**:
1. Map each output-section_key to a list of extracted-field path prefixes
   (e.g. `financial_analysis` → `income_statement.*`, `balance_sheet.*`,
   `cash_flow.*`)
2. For each section the agent left empty, find chunks whose `field_path`
   matches a prefix, dedupe by (doc_id, page), pick top-N by
   excerpt-length
3. Inject as the section's `citations[]`

**Server-side, deterministic, zero LLM cost**, retroactively fixes existing
memos. Acts as a safety net behind a tightened agent prompt.

**Section components must read `data.citations` as fallback** — three
sections in credit-memo (collateral, risk-rating-rationale, recommendation)
originally pulled citations from custom fields and ignored
`data.citations`. Fix in each section component.

---

## Pattern 7 — Edit drawer with click-to-add suggestions

**Use it when** users need to edit an LLM-generated artifact and
ground their edits in source documents.

**Reference**: `usecases/credit-memo-commercial/ui/components/credit-memo/memo-edit-drawer.tsx`

**Anti-pattern**: making the user open the PDF, find a page, type the
page number, and copy-paste the excerpt. That's hours of toil per memo.

**Pattern**: when the drawer opens, populate a "Suggested · click to
add" panel with all extraction chunks across all uploaded documents.
Each suggestion is a card showing `[doc_type pill] filename · p.N` +
verbatim excerpt. One click adds it as a citation.

**Filtering**: substring-match on `field_path + excerpt`. Score
suggestions higher when they contain the section_key tokens.

**Persistence**: `POST /api/applications/<id>/memo/edit-section` →
reads latest `application_artifacts` row → applies patch → INSERTs new
row at `revision_number = max + 1` with `author='banker'` → emits
`memo_edited` event.

---

## Pattern 8 — Eval framework: structural + LLM-judge + diff

**Use it when** you need to know whether a prompt change improved or
regressed quality, AND when you need to do continuous improvement on
agent output.

**Reference**: `evals/`

**Three layers**:

| Layer | What it checks | When |
|---|---|---|
| **Structural** (deterministic) | section completeness, citation grounding, numeric density, schema conformance | every PR; <1s; gate the PR |
| **LLM-judge** (probabilistic) | depth, accuracy, banker-fluency per rubric | nightly cron; ~30s/case; track score deltas |
| **Production telemetry** | banker edit rate per section, citations bankers add manually, reviewer rejection rate | weekly; mine `application_events.memo_edited` |

**Driver**: `scripts/run_evals.py --app-id <id> --label <name>` —
fetches memo + documents from Cloud SQL, runs scorers, writes
`evals/results/<run-id>.json`.

**Diff**: `scripts/eval_diff.py <baseline.json> <candidate.json>` —
prints per-scorer means + delta + significance flag.

**CI gate** (Rule 37): PRs touching `agents/prompts/*.md` must include
an eval result delta in the diff. Without measurement, every prompt
change is a guess.

---

## Pattern 9 — Workflow-driven UI with stage transparency

**Use it when** the workflow runs for minutes (multiple agents, atomic
services, HITL gates) and the user wants to know what's happening.

**Mandatory** (Rule 31): the workflow MUST write
`application_state.current_stage` at each major transition:

```
intake → extracting → extraction_review (HITL) →
spreading → analyzing →
rating → rating_review (HITL) →
drafting → reviewing →
draft_review (HITL) →
approval (HITL) →
posting → done
```

Without these writes, the UI's stage indicator stays on the prior pause
value while agents grind for 60-90s and the user thinks the case is
stuck.

**UI components**:
- `case-processing-panel.tsx` — chip-row stepper that flips green as
  stages complete; hides on terminal + HITL stages (action bar takes
  over there)
- `memo-empty.tsx` — when the memo doesn't exist yet, show
  `"<stage_label> · 23s in this stage"` with a live counter

**Stage labels**: keep one canonical map
(`STAGE_LABEL: Record<string, string>`) shared between
`case-processing-panel` and `memo-empty`. Single source of truth.

---

## Pattern 10 — Dynamic right-rail status, never hardcoded

**Use it when** the case-detail page has a right rail showing source
documents, decision, clock, audit stats.

**Anti-pattern** (paid for): hardcoded `"<borrower> 10-K" + "Latest 10-Q"`
even when the case actually has 4 documents. Always wrong, always
embarrassing.

**Pattern**: read from the live `application_documents` rows.
`ui/apps/pipeline-console/app/cases/[id]/page.tsx` shows the canonical
shape: filename · doc_type · page count · status dot (extracted/failed/processing).

**Decision badge** (Rule from session): only render decision label when
`stage === "done"`. While running show a neutral `"In progress · <stage>"`.
Never imply approval before the workflow finalizes — even if the DB
column has a stale value from a parallel writer.

**Clock** (similar): countdown chip is meaningful only on open cases.
On done cases replace with "Turnaround: X" stat (`updated_at - created_at`).

---

## Pattern 11 — Multi-stage Dockerfile + monorepo build context

**Use it when** the use case has a Next.js UI that imports across pnpm
workspaces (most do).

**Reference**:
- `ui/apps/pipeline-console/Dockerfile` — three stages (deps → builder → runner)
- `ui/apps/pipeline-console/cloudbuild.yaml` — explicit `--file` path

**Mandatory** (Rule 35): build context = **repo root** (not the app
dir), so the Dockerfile sees both `ui/` workspace AND `usecases/`. The
`@uc/*` path alias in `tsconfig.json` resolves to `usecases/<uc>/ui/*`
which is OUTSIDE the `ui/` workspace.

**Mandatory**: `next.config.mjs` has:
```js
output: "standalone",
outputFileTracingRoot: new URL("../../..", import.meta.url).pathname,
```

**Deploy command**:
```bash
gcloud builds submit . --config ui/apps/<app>/cloudbuild.yaml \
  --substitutions=_TAG=us-central1-docker.pkg.dev/.../pipeline-console:latest
gcloud run deploy fsi-ui-<app> \
  --image us-central1-docker.pkg.dev/.../pipeline-console:latest \
  --region us-central1 \
  --add-cloudsql-instances <project>:<region>:fsi-banking-dev \
  --set-env-vars FSI_<SERVICE>_URL=https://...,...
```

DO NOT use `gcloud run deploy --source` for these apps — it triggers
Buildpacks which doesn't see your Dockerfile and breaks on workspaces.

---

## Pattern 12 — Service-URL discovery: env var first, file fallback

**Use it when** any code needs the URL of a deployed Cloud Run service.

**Reference**: `ui/apps/pipeline-console/app/api/live/route.ts:resolveServiceUrl`

```ts
function resolveServiceUrl(name: string) {
  // 1. Production: env var FSI_<NAME>_URL
  const envVar = "FSI_" + name.toUpperCase().replace(/-/g, "_") + "_URL";
  if (process.env[envVar]) return process.env[envVar];
  // 2. Local dev: .fsi-state/<name>.url file
  const path = join(REPO_ROOT, ".fsi-state", `${name}.url`);
  if (existsSync(path)) return readFileSync(path, "utf-8").trim();
  return null;
}
```

`.fsi-state/` is in `.gitignore` AND `.dockerignore` (correctly — it's
a local-dev artifact). Code that ONLY reads from there will work in
dev and silently fail on Cloud Run.

---

## What to do at scaffold time for the next use case

1. **Read `product-build-discipline.md` rules 1-37 in full.** Each one
   was paid for in a real incident.
2. **Read this cookbook** end-to-end. Decide which patterns apply to
   your use case at scaffold time, not week 4.
3. **Run `/new-use-case <name>`**, which will ask the new questions
   added by Rules 29-37 (HITL gates? multi-doc? rules engine? evals?).
4. **For every pattern you adopt, point at the reference implementation
   in your `reasons.yaml`**:
   ```yaml
   reuse:
     - pattern: hitl_callback_via_cloud_workflows
       reference: usecases/credit-memo-commercial/workflow.v3.yaml
     - pattern: case_tabbed_shell
       reference: usecases/credit-memo-commercial/ui/components/case-shell/case-tabbed-shell.tsx
   ```
5. **At PR time, `/review-uc <name>` runs every gate from
   `product-build-discipline.md`** including the new ones (state-writer
   uniqueness, default-tab data-awareness, eval-delta-on-prompt-change).

The first use case took ~12 weeks. With this cookbook and disciplined
reuse, the second should land in 4-6.
