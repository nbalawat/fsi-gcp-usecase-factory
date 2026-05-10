# Using the factory effectively — don't spin your wheels

This is the practitioner's guide. The factory has a lot of moving parts (24 skills, 22 specialised agents, 12 atomic services, 6 archetypes, 5 patterns, 8 fragments, 14 agent archetypes, 11 Terraform modules). It looks intimidating; it isn't. **The factory is a collection of decisions other people already made for you.** Your job is to find the decision that already exists, not to invent a new one.

If you find yourself stuck for more than 30 minutes on the same problem, you're spinning your wheels. Stop and re-read the relevant section below.

---

## The single most important rule

> **Read before you build. Compose before you write. Ask before you decide.**

Almost every bug we've paid for came from violating one of these three. The 37 rules in `product-build-discipline.md` are downstream consequences. The 12 patterns in `factory-cookbook.md` are evidence that someone already solved your problem.

If you're typing fresh code and you haven't read those two docs in the last week, stop typing and read them.

---

## Where to start (decision tree)

```
What are you trying to do?

├── 1. "I have a new use case to build."
│        → /fsi-onboard <use_case>
│        → that runs the 7-round AskUserQuestion journey, emits onboarding.yaml,
│          enforces ≥80% atomic / ≥70% agent reuse BEFORE you scaffold a single file.
│        → if the gate fails, you go back to Round 4/5 and consolidate.
│        → THEN /init-use-case <name>, THEN /new-use-case, THEN /fsi-build-parallel.
│
├── 2. "I'm changing behavior in an existing use case (threshold, model, prompt, tool, sink)."
│        → /fsi-prompt-update <uc>
│        → REASONS-first. The architecture-auditor blocks the commit if reasons.yaml
│          and code drift apart. Editing code directly to change behavior is a forbidden pattern.
│
├── 3. "I'm refactoring (rename, extract, restructure — no behavior change)."
│        → /fsi-sync <uc>
│        → code-first; sync REASONS after.
│
├── 4. "I built the same shape three times and want to promote it."
│        → /fsi-promote-to-library
│        → moves the shape into libraries/{agents,patterns,workflows,use-cases}/
│          so the next UC can reuse it.
│
├── 5. "I need to know what already exists in the library."
│        → /fsi-search-library "<intent>"
│        → ranked search across all six reuse layers. Run this BEFORE you build anything.
│
├── 6. "I want to see how reuse is trending across the portfolio."
│        → /fsi-reuse-report
│        → shows reuse % per layer, retirement candidates (orphan services), promotion
│          candidates (shapes built ≥3 times that haven't been promoted).
│
├── 7. "I'm debugging."
│        → /fsi-portfolio first (registry view), then read the use case's logs:
│          gcloud logging read --project=$GCP_PROJECT --limit=20 ...
│        → check application_state, application_events, application_artifacts in Cloud SQL.
│        → check .fsi-state/<service>.url to confirm what's deployed.
│
├── 8. "I'm reviewing or about to commit."
│        → /review-uc <uc>     — full review (architecture + security + compliance)
│        → /fsi-reasons-review — just the intent (R/E/A/S)
│
└── 9. "I'm deploying."
         → /fsi-deploy <uc> [--env=dev|staging|prod]
         → uses Terraform modules in infra/modules/. Don't bypass to gcloud directly.
         → /promote <uc> — promotion gate (signatures + cross-impact analysis).
```

If your problem doesn't fit a branch above, **that is itself a signal** — it's probably already solved by an existing skill you haven't seen. Run `ls .claude/skills/` and read the `description:` line of every skill that sounds remotely related.

---

## The five wheel-spinning patterns (and the cure for each)

These are the failure modes new contributors hit. Each costs ~half a day before someone notices.

### 1. "I'll just write a quick Python script to do X."

**Symptom:** you reach for a one-off script in `scripts/` to compute something, classify something, or call an LLM.

**Why it spins wheels:** that script will end up duplicating logic that lives in an atomic service or an agent archetype. Two months later there are five versions of the same script and nobody knows which one is canonical.

**Cure:**
- If it's compute → check `services/atomic/` first; if nothing fits, check whether what you want belongs in an existing service.
- If it's an LLM call → check `libraries/agents/` first.
- If it's a rule → check `rules/` and `usecases/*/rules/`; if nothing fits, write a JDM rule, not Python.
- Last resort: a `scripts/<name>.py` that calls existing services + agents. Never inlines new logic.

### 2. "I need to add a new atomic service for X."

**Symptom:** you're about to scaffold a 13th service in `services/atomic/`.

**Why it spins wheels:** atomic services are expensive (Cloud Run + Dockerfile + manifest + Terraform module + IAM + tests + 10 quality gates per `factory-cookbook.md` Pattern 11). Most of the time the work belongs inside an existing service or in workflow composition.

**Cure (in order, halt at the first that fits):**
1. **Read the existing service's manifest.** Could your operation be a new endpoint on an existing service? Most "new service" requests are actually "new endpoint."
2. **Check whether composition would do.** Atomic services NEVER call other atomic services (forbidden pattern). Composition belongs in the workflow. Could the workflow call two existing services in sequence?
3. **Check `libraries/agents/`.** Could this be an agent role with `response_schema`, not a deterministic service?
4. **Run the reuse-rate gate** mentally: if you build this service, does the use case still hit ≥80% atomic reuse? If not, you're proliferating.
5. Only AFTER all four — and with a one-line justification you'd put in front of the architecture review — write a new atomic service.

### 3. "I need a new agent for X."

**Symptom:** you're about to add a 14th archetype to `libraries/agents/` or a new specialist inside a UC's `agents/` directory.

**Why it spins wheels:** the credit-memo team had 13 agents at peak. They paid for cost (~$0.15/case in LLM spend) and ops friction (any cross-cutting prompt change → 13 redeploys) before consolidating to 5. The 14 archetypes in the library are deliberately broad — most "new agent" needs are actually a parameter or prompt edit on an existing one.

**Cure:**
- Read every `archetype.yaml` / `manifest.yaml` in `libraries/agents/` (there are only 14 — it takes 15 minutes).
- If your need is "same role, different domain" → instantiate the archetype with use-case-specific parameters. That's what archetypes are for.
- If your need is "new role" → check `libraries/patterns/` for a multi-agent pattern that already wires roles.
- Only build a net-new agent if neither archetype nor pattern fits, and the role is genuinely new. Then promote it to `libraries/agents/` once two more UCs use it (rule of three).

### 4. "I'll write the workflow YAML by hand from scratch."

**Symptom:** you're authoring a new `workflow.yaml` longer than 100 lines, hand-rolling retry logic, callback wiring, DLQ paths, fan-out joins.

**Why it spins wheels:** every fragment you'd hand-write is already in `libraries/workflows/`. The 8 fragments cover ~95% of orchestration. Writing them again means writing the same retry / DLQ / callback wiring credit-memo-commercial debugged for two months.

**Cure:**
- Read `libraries/workflows/*/fragment.yaml` once. Names are self-explanatory: `fan-out-join`, `agent-call-with-retry`, `approval-gate`, `dlq-on-failure`, `idempotency-guard`, `regulatory-clock`, `retry-with-backoff`, `sink-fanout`.
- The use-case archetype's `archetype.yaml: required_libraries.workflow_fragments` tells you exactly which fragments the canonical shape uses.
- Compose with `include`. Never paste fragment bodies inline.
- Hard cap: 500 lines per workflow YAML. If yours is bigger, decompose into named sub-workflows.

### 5. "I'll just edit the React component to make the UI behave differently."

**Symptom:** you're modifying a use case's UI by hand-editing components, adding ad-hoc styling, or building a new console route.

**Why it spins wheels:** there are six console patterns, configured via `usecases/<uc>/ui/console.yaml`. Custom React for a UC is a forbidden pattern (architecture-auditor blocks it). Every "I just need a special panel" leads to a UC-specific React tree that drifts from the shared shell.

**Cure:**
- Edit `usecases/<uc>/ui/console.yaml` to reconfigure the shell. Read `console_reference.md` for the field names.
- If the panel is genuinely use-case-specific (e.g. credit-memo's spreading panel), put it under `usecases/<uc>/ui/components/` and import via the `@uc/*` path alias. Never under `ui/apps/<console>/`.
- Read `ui-standards.md` and `agentic-ui-principles.md` BEFORE writing any React — both are auto-loaded skills, but you should know what's in them.

---

## How to read the library efficiently

The library is six layers. You don't need to read every entry. You need to know what each layer offers in one sentence so you can decide where to look.

| Layer | One-sentence purpose | Where it lives | When you go here |
|---|---|---|---|
| **L1 atomic services** | Stateless compute primitives (one Cloud Run service, one or two endpoints) | `services/atomic/` | "I need to compute X from inputs" |
| **L2 JDM rules** | Deterministic decisions with versioned thresholds + regulatory citations | `rules/` (shared) + `usecases/*/rules/` (UC-specific) | "I need pass/fail/watch logic" |
| **L3 agent archetypes** | Parameterised LLM agent roles with response_schema + prompt skeleton | `libraries/agents/` | "I need an LLM to do X" |
| **L4 multi-agent patterns** | Pre-wired role+supervisor compositions | `libraries/patterns/` | "I need multiple agents to collaborate" |
| **L5 workflow fragments** | Reusable Cloud Workflows YAML snippets (retry / DLQ / fan-out / approval / clock) | `libraries/workflows/` | "I need orchestration plumbing" |
| **L6 use-case archetypes** | Whole-UC templates wiring layers 1-5 + a console pattern | `libraries/use-cases/` | "I'm starting a new UC" |

**The lookup discipline.** When you have an intent in mind:

1. Run `/fsi-search-library "<intent>"` — that returns a ranked list across all six layers.
2. Read the top three results' `archetype.yaml` / `manifest.yaml` / `pattern.yaml` / `fragment.yaml`.
3. If one fits, use it. If none fit, read three more. If still none, ask — usually a 5-minute conversation prevents a 5-day build.

**Manifest filename caveat.** Some agent archetypes use `manifest.yaml`, others `archetype.yaml`. Both are valid; the platform team is converging on `archetype.yaml`. If you can't find what you expect, check both filenames before assuming the library is incomplete.

---

## When to ask a question vs. when to build

Asking a question is cheap (~5 minutes). Building is expensive (~half a day minimum, more if you have to rework). The factory has a strong bias toward asking.

**Ask first when:**
- The shape you want isn't obviously in the library after a 15-minute search.
- You'd be the first UC to use a particular composition.
- You're tempted to violate one of the 37 discipline rules ("just this once").
- You don't understand WHY an existing convention exists. (The convention usually has a paid-for incident behind it; understanding the incident is faster than re-causing it.)

**Build first when:**
- The library entry exists and you just need to instantiate it with your parameters.
- The change is a parameter / threshold / prompt edit (use `/fsi-prompt-update`).
- The change is a pure rename / extract / move (use `/fsi-sync`).
- You're writing tests, fixtures, or compliance docs (always additive, never blocking).

---

## Escape hatches (when you're truly blocked)

The factory is opinionated, not authoritarian. There are explicit escape hatches:

1. **`reuse_gate_override` block in `onboarding.yaml`** — when arch-review approves a low-reuse-rate UC. Requires approver email + Jira ticket + date. The reuse-rate gate logs the override and exits 0.

2. **`EXCEPTION:` comment for non-approved models** — when you have a board-approved reason to use a model outside `{claude-opus-4-7, gemini-3-1-flash}`. The comment must cite the architecture review.

3. **Custom React with arch-review approval** — when a UC genuinely needs visual surface beyond what the six consoles provide. Captured in the UC's spec.md with a written justification. The architecture-auditor scans for unapproved custom React and fails the commit.

4. **Net-new atomic service** — when no library service fits and composition won't work. Requires a one-line justification in `onboarding.yaml: net_new_atomic_services[].justification` and shows up in `/review-uc`.

In every case, the escape hatch is **explicit, captured, and visible**. You should never silently work around a gate. The audit trail is what makes the factory safe; bypassing the audit trail is what makes regulators unhappy.

---

## The 30-minute onramp checklist

If a new contributor asks "where do I start," hand them this checklist. It's calibrated to take 30 minutes.

```
[ ]  1. Read docs/methodology/architecture.md            (~5 min — the 5-step paradigm)
[ ]  2. Read docs/methodology/factory-cookbook.md         (~10 min — 12 proven patterns)
[ ]  3. Read docs/methodology/product-build-discipline.md (~10 min — 37 paid-for rules)
[ ]  4. Skim docs/methodology/console_reference.md        (~3 min — 6 UI shapes)
[ ]  5. Run `ls .claude/skills/`                           (~2 min — read every skill's description)
```

After 30 minutes, you should be able to answer:
- What are the 5 steps?
- What are the 6 console patterns?
- What's the difference between `/fsi-prompt-update` and `/fsi-sync`?
- What are the three reuse targets (atomic / agents / rules)?
- Where do thresholds live? (Cloud SQL `thresholds` table — never hardcoded.)

If you can't answer those five, re-read. If you can, you're calibrated to start with `/fsi-onboard` for your first UC.

---

## Signals you're spinning your wheels

These are the smells. When you notice one, stop and re-orient.

| Smell | What's probably wrong | What to do |
|---|---|---|
| You've been editing the same file for >2 hours | You're probably hand-rolling something the library does | Run `/fsi-search-library` against the file's purpose |
| You're writing your fourth try/except for the same error | You're working around a violated convention | Check `product-build-discipline.md` for the related rule |
| You're copy-pasting from another use case | That shape should be promoted | Run `/fsi-promote-to-library` |
| The auditor keeps blocking your commit | You're drifting code from REASONS | Read the auditor's message; it cites the violated rule by name |
| Your workflow YAML has passed 300 lines | You haven't composed fragments | Open `libraries/workflows/` and compose |
| You're writing custom React | You're building a forbidden pattern | Use `console.yaml` reconfiguration instead |
| You're hardcoding a threshold | You'll fail policy review | Move it to the `thresholds` table with `effective_date` |
| You're calling another atomic service from inside an atomic service | You're building a forbidden pattern | Compose in the workflow |
| You can't find the library entry you expected | The platform team may have renamed it | Run `/fsi-search-library` with synonyms; if still missing, ask |
| Your first PR is >2000 lines diff | You skipped library reuse | Stop. Run `/fsi-onboard` retroactively against your branch |

---

## How the factory protects you (so you don't have to remember everything)

You don't need to memorise the 37 discipline rules. The factory enforces most of them at machine speed:

- **Pre-commit hook** — runs the architecture-auditor on every `git commit`. Bad commits are blocked with the violated rule cited by name.
- **Reuse-rate gate** — `scripts/check_reuse_rate.mjs` runs in `/fsi-onboard` and `/review-uc`. Atomic <80% or agents <70% is blocking.
- **OPA + Conftest** — runs against every Terraform plan. Catches IAM, encryption, networking, observability, tagging violations.
- **Skill auto-loading** — when you edit `reasons.yaml`, the `fsi-reasons-canvas` skill auto-loads. When you edit a workflow, `workflow-design` auto-loads. The right knowledge appears at the right moment.
- **`make test-all`** — runs the full deterministic test pyramid in <30 seconds, fully offline. Run before every PR.
- **`/review-uc`** — full multi-auditor review (architecture + security + compliance + tests + reuse rate). Run before every commit involving a UC.

When a gate blocks you, **read its message before working around it**. The message names the rule, the file, and the line. Almost every block is a real bug; bypassing it usually re-causes the incident the rule was paid for.

---

## TL;DR

1. Run `/fsi-onboard` for new UCs. The journey makes the right choices the path of least resistance.
2. Run `/fsi-search-library` BEFORE you build anything.
3. Compose, don't write. Six layers, 60+ shapes, exhaustive coverage of bank operations.
4. When in doubt, ask. Asking is 5 minutes; building wrong is half a day.
5. Trust the gates. They block real bugs. Don't work around them.

Read this document quarterly. The factory evolves; this guide will too.
