# Pattern: reflection-loop (RARE — arch review required)

Drafter → critic → drafter loop. Hard cap of 3 round-trips (instance can't override above 3).

## When to use

**Almost never.** This pattern is only for cases where:

- The output is regulator-facing and rejection is expensive (SAR, breach notification, examiner response).
- A first-pass draft has historically had high rework rates (track over ≥1 quarter).
- The cost of an extra Opus call per case is small relative to rework cost.

For everything else, prefer single-pass drafter + human review (the human IS the critic, much cheaper).

## Why arch review is required

Reflection loops have failure modes:

- **Oscillation**: drafter and critic disagree; loop maxes out without convergence.
- **Cost runaway**: each loop is an Opus call. 3 loops × multi-thousand-token contexts = real money per case.
- **False confidence**: a drafter that "passes" the critic on round 2 may have been gamed by the critic's exact phrasing.

Each new instance of this pattern must demonstrate (with measured baseline data) why the simpler patterns don't suffice.

## Diagram

```
initial → [drafter] ──→ [critic]
                         │
              acceptable? ┼─ yes ──→ emit
                         │
                       (no, but max_loops not exceeded)
                         ↓
                    [drafter] ←──── critique
                         ↓
                    (loop, hard cap = 3)
```

## Instantiation example

```yaml
structure:
  multi_agent_pattern: reflection-loop@1.0
  agent_archetypes:
    - role: drafter
      archetype_ref: regulatory-narrator@1.0
      params: {target_regulator: FinCEN-SAR, format_template: templates/sar-narrative-fincen-2024.md}
    - role: critic
      archetype_ref: regulatory-narrator@1.0
      # critic prompt overrides — same archetype, different system instruction
      params: {target_regulator: FinCEN-SAR-critic-mode, format_template: templates/sar-critic-checklist.md}
  pattern_params:
    max_loops: 2
    critic_blocking_thresholds:
      citation_density_min: 0.90
      max_words: 1500
```
