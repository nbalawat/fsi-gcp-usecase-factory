# UX-first discipline — design lockdown before backend code

The factory's hardest-won lesson, in one sentence:

> **Wrong UX is wasted backend.** Backend code generated against an
> unsigned UX is rebuilt — twice on credit-memo-commercial, half a
> day each, ~$3K of analyst time per round.

So we made it impossible to skip. After `/fsi-onboard` locks the
canvas (rounds 1-7), the journey halts. Four parallel sealed designer
agents generate four working Next.js prototypes (each a different
variation axis), deploy them to ephemeral Cloud Run URLs, and the user
clicks through, picks one, and signs the design contract. Only then
does `/init-use-case` scaffold anything backend.

This doc explains why, when, and how.

---

## Why UX-first

We tried backend-first three times in a row on credit-memo-commercial:

1. **Round 1** — built 13 agents, 8 atomic services, full workflow. UI was
   "we'll figure it out from the data we now have." User opened the case
   detail screen and said "this is so hard." Five days of UI rework.
2. **Round 2** — rebuilt UI as three-pane shell. Found the data shape was
   wrong (no per-section citations, drafter dumped 10-section memo as a
   single string). Two weeks of agent prompt + schema work.
3. **Round 3** — rebuilt agent stack (13 → 5) because the UX needed
   per-section streaming. Three weeks.

Total: roughly 4 weeks of rework that would not have happened if we'd
locked a UX before any backend ran. The factory now refuses to repeat
this.

---

## When the discipline applies

UX lockdown runs **for every use case that has a human user surface** —
which is most of them, even "back-office" ones. Real exemptions are
narrow:

| UC profile | UX lockdown |
|---|---|
| Pure batch / scheduled job, no humans interact | Skip with `--skip-design --reason="<why>"`; rationale lands in `.no-design-rationale.txt` and shows up in `/review-uc` |
| Surveillance UC where the only output is an alert that surfaces in another UC's console | Skip allowed with rationale citing the parent UC's decision.yaml |
| Real-time scoring with no human-visible UI (called by another service) | Skip allowed |
| All others | UX lockdown REQUIRED |

When in doubt: **lock**. The skip path is permanent and visible to every
reviewer. Cheap to opt in, expensive to opt out and discover later you
needed it.

---

## The 7-stage pipeline

Walked end-to-end:

```
/fsi-onboard <uc>                         (rounds 1-7, captures canvas)
       ↓
/fsi-design-proposals <uc>                (Stages 1-3)
   1. pre-flight: SHA-pin canvas, generate _shared/mock-data.ts
   2. spawn 4 sealed Agent calls in ONE message:
        Option A · density seed     ┐
        Option B · metaphor seed    │ each works in its own
        Option C · affordance seed  │ git worktree, never sees
        Option D · wildcard seed    ┘ the others' code
   3. parallel Cloud Build → 4 ephemeral Cloud Run URLs
       ↓
/fsi-design-review <uc>                   (Stages 4-7)
   4. build _review.html (2x2 iframe grid + scoring strip)
   5. AskUserQuestion: pick + keep/drop/change + lock_level
   6. (only if user picks "none"): one re-spin with annotations as constraints
   7. promote winner → ui/components/, archive losers → _archive/<TS>/,
      tear down losing Cloud Run services, write decision.yaml (LOCKED)
       ↓
/init-use-case <uc>                       (Step 0 refuses if decision.yaml absent)
   ↓
/new-use-case + /fsi-build-parallel       (backend code respects decision.yaml)
   ↓
/review-uc <uc>                            (auditor verifies archive intact)
   ↓
/promote <uc>                              (regulator audit trail intact)
```

---

## Key contracts

### `usecases/<uc>/ui/decision.yaml`

The locked design contract. Schema at `.claude/schemas/ui-decision.schema.yaml`.
Fields the rest of the factory cares about:

- `chosen_option` — A/B/C/D (or E/F if re-spin)
- `variation_axis` — density / metaphor / affordance / wildcard / respin
- `lock_level` — `full` (default) / `layout-only` / `metaphor-only`
- `canvas_checksum` — SHA256 of `onboarding/<uc>.yaml` at design time. Drift detected by `/init-use-case` and `/review-uc`.
- `archive_path` — relative path to `_archive/<TS>/` (kept FOREVER)
- `annotations.{keep, drop, change}` — what backend must respect
- `rejected_options[]` — every loser's manifest summary + rationale

### `usecases/<uc>/ui/proposals/option-{a,b,c,d}/manifest.yaml`

Each designer agent emits this. Schema at `.claude/schemas/option-manifest.schema.yaml`.
Used by the comparator + the diversity scorer + the audit trail.

### `archives/design/<uc>/<TS>/`  (top-level)

Forever-archive. Lives at the TOP LEVEL — out of the per-UC tree — so
the UC directory stays clean (no `_archive/` subdirectory cluttering
every `ls usecases/<uc>/ui/`). One greppable place for all design
forensics across all UCs.

Contains every rejected option's full directory (manifest +
rationale + tradeoffs + components + app + Dockerfile) plus the
comparator `_review.html` from the round that produced the winner.

Architecture-auditor refuses any commit that deletes or modifies files
under `archives/`. The winning option's **source pin** lives separately
at `usecases/<uc>/ui/proposals/option-<chosen>/` — see `archives/README.md`
for the why.

---

## When to re-spin

A re-spin is one extra round (E + F + a re-run of one A-D) under the
user's annotations. **One re-spin per UC, max.** After that, escalate
to arch-review.

Good reasons to re-spin:
- All 4 options converge on a single position (diversity scorer fires)
- The user picks "none" with a clear "you all missed X" rationale
- An option you would have picked failed to build (deploy failure ≠ design failure)

Bad reasons to re-spin:
- "I want to see more options" without a specific complaint about the 4
- "What if we tried Y" without explaining why X (the closest existing option) is wrong
- "Let me think about it" — that's not a re-spin trigger; either pick or escalate

The skill enforces this: the re-spin path requires you to articulate a
positive direction, not just rejection. The annotation format forces a
keep/drop/change shape.

---

## Lock level — what changes are allowed after the design is locked

| `lock_level` | What's frozen | What can evolve |
|---|---|---|
| `full` (default) | Layout, metaphor, affordance | Visual polish, copy, animations, color tokens |
| `layout-only` | Layout (route grid, panel positions) | Metaphor + affordance can evolve as the UC matures |
| `metaphor-only` | The primary metaphor (e.g. "this UC is conversation-first") | Layout + affordance free; widely useful for highly experimental UCs |

`full` is the right default. Loosen only when the metaphor is genuinely
the contract — e.g. a customer-facing UC where the metaphor is the
brand promise, but layout iterates on weekly user research.

The architecture-auditor enforces lock_level. Layout-shape diffs (route
additions, top-level panel restructuring) on a `full` lock fail the
commit. The fix is either weakening the lock with arch-review approval
or running `/fsi-design-proposals --redo`.

---

## Cost budget

| Item | Cost |
|---|---|
| 4 designer agents at $1.50/option | $6 |
| 4 Cloud Builds (~3 min each) | $0.20 |
| 4 Cloud Run idle | free |
| Re-spin (one round of 3) | $4.50 + $0.15 |
| **Total per UC, including one re-spin** | **~$11** |

Compare to: ~$3K of analyst time per backend rework. The discipline
pays for itself on the first prevented rework.

A skill-level $20 ceiling guards against runaway agents. If exceeded
the skill halts and surfaces partial state.

---

## What the user actually sees

```
$ /fsi-onboard mortgage-origination
... 7 rounds of AskUserQuestion ...
✓ canvas locked at onboarding/mortgage-origination.yaml

Next: /fsi-design-proposals mortgage-origination

$ /fsi-design-proposals mortgage-origination
✓ pre-flight ok (canvas SHA: a9489828…)
✓ generated _shared/mock-data.ts (6 atomic stubs, 5 agent stubs, 22 events)
→ spawning 4 designer agents (sealed worktrees)
  · option A · density        Agent #abc1
  · option B · metaphor       Agent #abc2
  · option C · affordance     Agent #abc3
  · option D · wildcard       Agent #abc4
... 18 minutes ...
✓ 4/4 options compiled cleanly
→ Cloud Build (4 parallel) ...
... 9 minutes ...
✓ 4/4 deployed
  A: https://fsi-uc-mortgage-origination-design-a-...run.app
  B: https://fsi-uc-mortgage-origination-design-b-...run.app
  C: https://fsi-uc-mortgage-origination-design-c-...run.app
  D: https://fsi-uc-mortgage-origination-design-d-...run.app
Cost: $7.20  Wallclock: 27 min

Next: /fsi-design-review mortgage-origination

$ /fsi-design-review mortgage-origination
✓ comparator at file:///.../usecases/mortgage-origination/ui/proposals/_review.html
... [user opens browser, clicks through] ...
[AskUserQuestion: which option? → C]
[AskUserQuestion: keep? → "inline approve/reject" + "midnight-forensic density"]
[AskUserQuestion: change? → "make hero panel sparser; pull approval below the fold"]
[AskUserQuestion: lock_level? → full]
✓ promoted option C → usecases/mortgage-origination/ui/components/
✓ archived A, B, D + comparator → _archive/20260510T142233Z/
✓ tore down 3 Cloud Run services
✓ wrote decision.yaml

Next: /init-use-case mortgage-origination
```

---

## Failure modes and what to do

| Symptom | Cause | Fix |
|---|---|---|
| `/init-use-case` refuses with "no design contract" | Tried to skip the lockdown | Run `/fsi-design-proposals` + `/fsi-design-review`, OR pass `--skip-design --reason="<why>"` |
| `/init-use-case` refuses with "canvas drift" | Canvas was edited after design ran | Either `git checkout onboarding/<uc>.yaml` to revert, or re-run design proposals |
| Architecture-auditor blocks commit with "archive incomplete" | A file under `_archive/` got deleted | `git checkout` it back; archives are forever |
| `/fsi-design-proposals --respin` refused | Already used the one allowed re-spin | Escalate to arch-review for an `iteration_override` block |
| All 4 designer agents convergent | Agents picked similar shapes | Re-run with `--respin --diverge` to force anti-convergence in agent prompts |
| Cloud Build fails for 1-2 options | Flake or quota | Continue with the rest; or `--rebuild-only` to retry just those |
| Cloud Build fails for 3-4 options | Probably a Dockerfile / mock-data issue | Surface logs; may indicate a regression in the foundation; halt and investigate |

---

## Discipline rules paid for here

The `product-build-discipline.md` rules earned by this lesson:

- **Rule 38 (NEW)** — UX-first: no backend code without `ui/decision.yaml`. Auditor BLOCKING gate.
- **Rule 39 (NEW)** — Design archives are forever; archive deletions fail the commit. Auditor BLOCKING gate.
- **Rule 40 (NEW)** — Canvas drift detection: `decision.yaml: canvas_checksum` must match current canvas SHA at every backend-touching commit.

(These rules will land when `product-build-discipline.md` is updated to incorporate the UX-first lockdown — see follow-up commit.)

---

## TL;DR

1. UX-first because backend rework is more expensive than upfront design exploration.
2. 4 sealed parallel agents on 4 axes (density, metaphor, affordance, wildcard).
3. Working Cloud Run URLs, click-through, comparator HTML.
4. Pick + annotate; re-spin allowed once.
5. Locked contract (`decision.yaml`) is the spec backend builds against.
6. Archives are forever. Auditor enforces.
