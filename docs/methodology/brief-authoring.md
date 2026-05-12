# Authoring a use case brief — sponsor guide

This guide is for the **person sponsoring a new use case** — the person
who can't fall back to "the engineers will figure it out" because *you
ARE the one specifying what the engineers should build*.

The brief is the spec. Every downstream factory skill (`/fsi-design-proposals`,
`/init-use-case`, `/new-use-case`, builder agents) consumes it directly.
**A vague brief produces a vague product.** Time spent here pays for itself
five times over downstream.

You enter this skill by running `/fsi-onboard <uc-id>`. It runs an
interview that takes 30–45 minutes and asks ~25–40 questions. By the end,
you have:

- `usecases/<uc>/brief.yaml` — the machine-readable master
- `usecases/<uc>/brief.md` — the human-readable render with a state-machine diagram
- `onboarding/<uc>.yaml` — auto-derived legacy canvas for older skills

---

## Before you start

You'll move faster if you have these in hand:

- **Problem statement** — one paragraph in your own words about what's
  broken today and what changes once this UC ships
- **Names of 3–6 personas** who'll use the resulting UI (the library
  covers 17 banking roles; pick from there)
- **Workflow stages** — even sketch-level, 3–8 steps from trigger to
  completion
- **Data sources** — what data does the UC need, and where does it live today
- **Regulatory citations** — Reg O, BSA, SR 11-7, etc., whichever apply
- **Cost / latency budgets** — what's the max you'd accept per case-decision in $ and seconds

If you don't have all of these, that's fine — start anyway. The skill
will probe shallow answers and ask you to deepen them. You can also
paste in any pre-existing write-up you have at Q0 and the skill will
use it to pre-fill what it can.

---

## The 14 brief sections — what each one is for

### 1. Problem framing

The "why" of the use case. Four sub-fields:

| Sub-field | What good looks like |
|---|---|
| **statement** | One paragraph. Names the pain in concrete terms. Avoid "we want to leverage AI" — say "credit memos take 8 days to underwrite when business demands 3, and analysts spend 6 of those days on mechanical spreading and document hunting." |
| **current_state** | Walk me through what people / systems do today. Specific tools. Specific handoffs. Where the time / money / accuracy goes to die. |
| **future_state** | Once shipped, what changes? Describe the moment-of-truth: who is sitting in front of what screen doing what differently? |
| **success_metrics** | 2–4 metrics with baseline + target + horizon. Sharper numbers win. "Credit memo turnaround 8d → 3d, by Q4 2026" beats "faster underwriting." |

**Common mistake:** writing the problem statement as a sales pitch. The
brief is internal. State the actual problem, not the marketing version.

---

### 2. Stakeholders + personas

The "who" of the use case. Two parts:

- **Sponsor:** the named executive who owns the outcome of this UC. Name + title + org.
- **Personas:** the people who actually use the UI. Pick from `libraries/personas/`.

Library covers: `rm-wholesale`, `rm-middle-market`, `rm-ops`, `credit-analyst`,
`underwriter`, `cco`, `bsa-officer`, `fraud-analyst`, `model-risk-officer`,
`compliance-officer`, `occ-examiner`, `internal-auditor`, `treasury-manager`,
`loan-servicer`, `customer-service-rep`, `branch-manager`, `wealth-advisor`.

For each persona, mark `involvement`:
- `primary` — uses the UC daily
- `secondary` — touches occasionally
- `approver` — signs off (no daily use)
- `examiner` — audits retrospectively

Per-UC overlay lets you specify nuance: "for THIS UC, the rm-wholesale
specialises in healthcare manufacturing borrowers."

**Common mistake:** listing every conceivable role. List only the
personas who'll actually see the UI or sign off on its output.

---

### 3. Process + workflow + state machine

The "what" of the use case at the architectural level.

- **area** — which banking process (credit-origination, fraud-real-time, bsa-aml, etc.). Picks from a closed list.
- **console_pattern** — one of the 6 patterns (pipeline / investigations / real-time / surveillance / run / recommendations). This **branches the question set** — pick this wisely.
- **trigger_event** — what kicks off ONE instance of the UC ("loan application submitted", "fraud alert fires", "quarterly clock starts").
- **stages** — the state machine. 3–8 stages, each with id, name, entry trigger, exit condition, agents-active, services-called, optional HITL gate, next-states.

The skill renders this as a Mermaid diagram in `brief.md`. The state
machine is the spine of every downstream artifact.

**Common mistake:** writing the workflow as a happy path only. Include
rollback states. If anything can "return for revision" or "escalate to
exception queue", that's a state.

---

### 4. Data sources

The "what does this UC consume" section. For each source:

- **name** — what you call this dataset in conversation
- **source_system** — where it physically lives (`Cloud SQL`, `FIS Profile`, `NICE Actimize`, `Pub/Sub topic`, etc.)
- **refresh_cadence** — `real-time`, `near-real-time`, `minutes`, `hourly`, `daily`, `weekly`, `monthly`, `quarterly`, `on-demand`
- **owner_team** — which team you call when this source breaks
- **access_method** — `sql`, `rest-api`, `file-drop`, `kafka`, `pubsub`, `vendor-sdk`
- **schema_summary**, **freshness_sla**, **quality_issues**, **pii_fields** — for production-bound UCs

See `.claude/skills/fsi-onboard/assets/section-examples/data-lineage.md`
for a fully-filled example.

**Common mistake:** listing only the data sources you already know about.
Talk to the data team — they probably have 2–3 more you don't.

---

### 5. Atomic services

The deterministic compute the UC needs. For each:

- **name**
- **purpose** — what it computes
- **reuse_status** — `reuse-existing`, `extend-existing`, `net-new`
- **existing_service_path** — if reusing
- **inputs_sketch / outputs_sketch**
- **net_new_justification** — required if `net-new`; why an existing service doesn't work

The skill **suggests reuse in real time** by scanning `services/atomic/`.
When it finds a match, it'll say "we already have peer-and-industry-context
— adopt?" Don't say no without a reason.

**Common mistake:** declaring a service "net-new" before checking the
factory. The factory has 8+ atomic services already. Reuse first.

---

### 6. Rules

Deterministic decisions encoded as JDM/GoRules Zen rules. For each:

- **name** (kebab-case)
- **purpose**
- **reuse_status**
- **regulatory_citation** — if the rule encodes a regulation
- **inputs_sketch / outputs_sketch / thresholds**

A rule belongs here if the decision is:
- threshold-based (e.g. single-borrower limit)
- lookup-based (e.g. watchlist screening)
- regulation-driven and deterministic (e.g. Reg O insider check)

If the decision requires interpretation or judgment, it's an agent
decision — see Section 7.

---

### 7. Agent operating envelope (the heaviest section)

This section defines **exactly what agents decide vs. interpret vs.
narrate**. It's the most consequential section in the brief — get this
right and downstream agent code writes itself; get it wrong and you
build 13 agents when 5 would do.

Three sub-sections:

**7.1 Decision points** — Every meaningful decision in the UC, tagged:
- `rule` — purely deterministic threshold / lookup
- `agent` — requires interpretation / judgment / narrative
- `hybrid` — agent proposes + rule validates
- `human` — explicit human decision (HITL gate)

Each row has a **rationale** explaining "why this type and not the others."

**7.2 Stage envelopes** — Per workflow stage, what the agent does and does NOT do. Forces clarity about scope creep into rule territory.

**7.3 Agent sketches** — Per agent: role, purpose, model_provider, archetype reuse, and the response_schema fields. This is the schema the agent's structured output must conform to.

See `.claude/skills/fsi-onboard/assets/section-examples/agent-envelope.md`
for a fully-filled real example from credit-memo-commercial.

**Common mistake:** specifying agents but not their response schemas.
Without schemas, agents drift. With schemas, they don't.

---

### 8. Sinks

Where decisions and artifacts from this UC go. For each:

- **destination** — `gl-posting`, `document-store-gcs`, `regulator-filing`, `customer-notification`, `downstream-uc`, `bigquery-analytics`, `alert-queue`, `vendor-system`
- **purpose**
- **trigger** — what state transition fires the sink
- **irrevocable** — boolean. If true, this sink can NEVER be auto-fired; it must be human-gated.
- **retention_period** — regulatory retention

**Common mistake:** forgetting downstream UCs. If this UC's output feeds
another UC, that's a sink — and it shows up in the dependencies section
too.

---

### 9. HITL gates

Human-in-the-loop gates. Empty array is valid (real-time / advisory UCs
have none). For each gate:

- **id** + **name** + **stage_id** — what + where
- **irrevocable** — boolean. Critical. Reversible gates are different UX from irrevocable ones.
- **approver_role** — which persona signs off
- **quorum** — `single`, `dual`, `committee-3`
- **clock** — name, duration, citation if regulatory clock applies
- **override_path** — who can override / escalate; empty if no override allowed

---

### 10. Console + moments-of-truth

The UI shape. Two parts:

- **pattern** — one of 6 console patterns (echoed from Section 3)
- **moments_of_truth** — 2–4 screens with `user_sees` + `user_acts`

Designer agents read this to design the UI. Be specific about what the
user is looking at and what action the screen enables.

---

### 11. Compliance

Light-touch citation capture. Two parts:

- **scope** — `lightweight` (no regulator-visible artifact), `moderate` (bank-internal compliance only), `high` (OCC/FDIC/Fed-visible artifacts)
- **regulations** — list of `cite_key` entries: "Reg O §215.4", "SR 11-7", "31 CFR §1020", etc.

See `.claude/skills/fsi-onboard/assets/section-examples/compliance-citations.md`.

Validation that each citation correctly applies is done downstream by
the compliance-reviewer subagent. Don't over-engineer this section.

---

### 12. Model selection + budgets

The "what models and how expensive" section.

- **primary_provider** — `vertex-gemini`, `anthropic-claude`, or `hybrid-runtime-flag`
- **models** — specific model IDs (gemini-3-1-flash, claude-opus-4-7, etc.)
- **structured_output_strategy** — `response_schema`, `prompt-only`, `tool-use`, `n-a`
- **cost_ceiling_per_case_usd** — max $ per case decision
- **p99_latency_budget_ms** — max wall-time, p99
- **prereqs_confirmed** — list of prerequisites you've verified (ADC, region, IAM, etc.)

The auto-generated economics projection in Section A4 will check your
projections against these budgets.

---

### 13. SLOs + risks + rollback

- **slos** — what we commit to operationally. Per metric: target + error budget.
- **top_risks** — top 1–7 risks. Per risk: probability + impact + detection + rollback plan.

If a risk doesn't have a detection mechanism and a rollback, you haven't
thought about it yet. Either fix or remove.

---

### 14. Phasing + out-of-scope

- **mvp_scope** — what ships in week 1
- **phase_2**, **phase_3** — optional sequencing
- **out_of_scope** — **explicit non-goals**. The most useful field in the brief. Without out-of-scope, every conversation drifts into "could we also..." This pins it down.

---

## Appendices

### A1. Predecessor / replacement

What system / process / Excel-file does this UC replace? Migration plan?
Retirement date? Parity period in days?

"Greenfield" is a valid answer.

### A2. Adjacent UCs

`depends_on` and `depended_on_by` lists. Feeds cross-impact analysis at
PR time. If your UC's output feeds another UC, list it here.

### A3. Glossary

Bank-specific terms that appear in the brief. Future engineers will
thank you.

### A4. Reuse map + economics projection (auto-generated)

The skill stamps this after the rest of the brief is complete. It runs
`scripts/scan_factory_for_reuse.mjs` which finds candidates the sponsor
didn't already adopt, plus a projected per-case cost and p99 latency
based on the reused components.

---

## How the brief drives downstream skills

| Downstream skill | Reads from brief |
|---|---|
| `/fsi-design-proposals` | `console`, `stakeholders.personas`, `process.stages`, `agent_envelope.agent_sketches` |
| `/init-use-case` | every section (it's literally driving the scaffolding) |
| `/new-use-case` | every section |
| `handler-builder` | `process.trigger_event`, `process.stages[0]`, `data.sources` |
| `agent-specialist-builder` | `agent_envelope.agent_sketches[]` |
| `jdm-rule-builder` | `rules[]` |
| `sink-adapter-builder` | `sinks[]` |
| `terraform-author` | `data.sources`, `model_selection`, `slos_risks_rollback` |
| `compliance-doc-builder` | `compliance`, `slos_risks_rollback.top_risks` |
| `test-author` | `agent_envelope.agent_sketches[].response_schema_fields`, `slos_risks_rollback.slos` |

If a downstream skill needs information not captured in the brief, it
writes a clarification note to `usecases/<uc>/.clarifications/<skill>-<timestamp>.md`.
You can review these and re-run `/fsi-onboard` to fill the gap.

---

## Common pitfalls

1. **Letting the engineer fill the brief.** The sponsor must own this.
   The engineer ends up filling it the way they'd want it to be, which
   is by definition not the sponsor's view.

2. **Over-specifying the technology.** The brief is about WHAT, not HOW.
   Don't pick atomic-service implementation details unless they're
   constraints (vendor system, specific data shape, regulatory mandate).

3. **Vague success metrics.** "Faster" isn't a metric. "8 days → 3 days
   by Q4 2026" is.

4. **Skipping out-of-scope.** This is the single highest-leverage field
   in the brief. List 4–6 things this UC explicitly does NOT do.

5. **Hand-waving the agent envelope.** If you can't tell me which
   decisions are rules vs. agents vs. hybrid, you don't know enough about
   the UC yet. Stop and think.

6. **Listing reused atomic services without checking the factory.** The
   skill suggests reuse for you in real time — adopt the suggestions
   unless you have a reason not to.

---

## Iterating

You can re-run `/fsi-onboard <uc>` anytime. The skill detects an existing
brief and offers three modes:

- **re-interview from scratch** — discards the existing brief, walks
  every question again
- **edit specific sections** — pick sections by number; the skill asks
  only those questions
- **just view it** — opens `brief.md` in your terminal

Each save bumps `last_modified`. Git history is the version trail.
Downstream artifacts that already consumed the brief carry a
`brief_consumed_at` timestamp; if they're stale, the auditor surfaces it.

---

## Authoring tone

- Write to a colleague who arrives next week. Avoid abbreviations they
  won't know.
- Bias toward concrete examples over abstract principles.
- When you're tempted to write "we'll figure that out later", stop and
  figure it out now if you can. Future you will thank present you.
- If a section genuinely doesn't apply (e.g. HITL gates for a real-time
  fraud UC), it'll be empty / skipped by the skill's branching — don't
  force content.

---

## Quality bar

A good brief, when handed to someone who's never heard of your UC,
should let them answer all of these questions in 10 minutes:

- Why does this UC exist?
- Who uses it daily?
- What does the workflow look like end-to-end?
- Where do the inputs come from?
- Who decides what, and where do humans gate?
- Where does the output go?
- What does success look like in 90 days?

If any of those takes longer than 10 minutes to figure out from the
brief, the brief needs more work.
