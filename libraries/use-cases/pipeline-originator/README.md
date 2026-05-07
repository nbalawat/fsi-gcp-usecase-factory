# pipeline-originator@1.0

## When this archetype fits
Use when ALL of these hold:
- The flow takes hours-to-days end-to-end (not sub-second; not seconds).
- Work moves through discrete, observable stages a human can watch.
- A regulator imposes a deadline (OCC 5-day credit decision, Reg E 10-day investigation, Reg B 30-day adverse action).
- The terminal action is irrevocable and requires human approval (memo approval, GL post, customer-facing letter).
- The console pattern is `pipeline-console` (multi-day stage flow).

Canonical instance: **credit-memo-commercial** (commercial C&I memo through extraction → spreading → rating → drafting → approval).

Other candidates: mortgage origination, trust-account opening, large-wire onboarding, complex AML case adjudication.

## The canonical 5-step decomposition
```
1. handler            → Pub/Sub-pushed Cloud Run; enriches event, emits to workflow
2. atomic services    → fan-out-join@1.0 over use-case-supplied spreaders
3. rules              → JDM rules called sequentially via rules-service
4. agent              → multi-agent pattern (e.g. extractor-spreader-rater-drafter)
                        wrapped in agent-call-with-retry@1.0
5. sinks              → sink-fanout@1.0 (queue, doc store, optional GL post)
```
Plus cross-cutting:
- **regulatory-clock@1.0** runs as a parallel branch publishing threshold + breach alerts.
- **dlq-on-failure@1.0** wraps every fallible step's `except:` arm.
- **approval-gate@1.0** sits between agent and sinks — irrevocable sinks (GL post) are gated; non-irrevocable sinks (officer queue, doc store) can fire pre-approval if the use case wants the officer to see the draft.

## Standard HITL pattern
HITL Pattern 3 — approval gate. The agent produces a recommendation; the workflow pauses on a callback URL while the case sits in the officer queue. The officer's POST resumes the workflow with `disposition: approve|reject`. On `approve`, the irrevocable sinks fire. On `reject`, the workflow publishes a rejection event and terminates.

## How to instantiate
1. Author the use case's `reasons.yaml` (see `.claude/skills/fsi-reasons-canvas/SKILL.md`). Set `structure.use_case_archetype: pipeline-originator@1.0`.
2. Populate `structure.workflow_fragments` with the fragments listed under `required_libraries` (omit optionals you don't need).
3. Populate `structure.agent_archetypes` per the multi-agent pattern you chose.
4. Run `/fsi-build-parallel` — it renders `workflow-skeleton.yaml.j2` against your `reasons.yaml`, splices each `# include: libraries/workflows/<frag>@1.0` marker with the fragment's `fragment.yaml.j2` (rendered with the use-case parameters), and writes `workflows/{use_case_id}.yaml`.

## Canonical instance
`usecases/credit-memo-commercial/reasons.yaml` is the reference. Its `structure.workflow_fragments` lists exactly the six fragments composed by this archetype. The rendered output for credit-memo lives at `tests/golden/example_credit_memo_workflow.yaml`.
