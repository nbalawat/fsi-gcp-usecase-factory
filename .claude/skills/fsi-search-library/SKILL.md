---
name: fsi-search-library
description: Search all six reuse layers (atomic services, rules, agent archetypes, multi-agent patterns, workflow fragments, use-case archetypes) given natural-language intent. Returns a ranked list of matches with versions.
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(ls:*, cat:*, find:*, grep:*)
---

You are searching the bank's six reuse layers for shapes that match a natural-language intent. The factory's reuse target is ≥60% by use case #5; this skill drives that.

## Inputs

- `$ARGUMENTS` — natural-language intent. Examples:
  - "compute DSCR with stress scenarios"
  - "extract financial data from a 10-K"
  - "rate commercial credit risk"
  - "approve / decline / refer based on regulatory thresholds"
  - "score real-time payment fraud"

## Step 1 — Inventory each layer

Walk all six layers, gather names + descriptions:

```bash
# Layer 1 — Atomic services
for d in services/atomic/*/; do
  name=$(basename "$d")
  desc=$(grep -m1 '"description"' "$d/manifest.json" 2>/dev/null | sed 's/.*"description": *"\([^"]*\)".*/\1/')
  echo "L1 $name@$(grep -m1 '"version"' "$d/manifest.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/') — $desc"
done

# Layer 2 — Rules (shared + use-case-specific)
find rules -maxdepth 2 -name '*.json' -not -path '*/tests/*' -exec basename {} .json \; | sort -u
find usecases -path '*/rules/*.json' -not -path '*/tests/*' 2>/dev/null

# Layer 3 — Agent archetypes
for d in libraries/agents/*/; do
  name=$(basename "$d")
  ver=$(grep -m1 '^version:' "$d/archetype.yaml" | sed 's/version: *//')
  desc=$(grep -m1 '^description:' "$d/archetype.yaml" | sed 's/description: *//')
  echo "L3 $name@$ver — $desc"
done

# Layer 4 — Multi-agent patterns
ls libraries/patterns/

# Layer 5 — Workflow fragments
ls libraries/workflows/

# Layer 6 — Use-case archetypes
ls libraries/use-cases/
```

## Step 2 — Score each candidate

For each candidate, score against the intent:

- **Exact match (3 pts):** name or description directly references the intent's domain object
- **Partial match (2 pts):** description shares ≥2 noun phrases with the intent
- **Tangential (1 pt):** described in the same broad area but not directly relevant
- **Miss (0 pts):** no overlap

For Layer 3 (agent archetypes) also weight the `tool_signature`: an archetype that already declares the right tool surface scores higher.

## Step 3 — Present ranked matches

Show the top results per layer, with each result's full reference:

```
Top matches for "compute DSCR with stress scenarios":

L1 — Atomic services:
  ★ services/atomic/dscr-calculator@1.0 (3pts)
    "Compute DSCR base + stressed under loan terms; classify into pass/special-mention/substandard/doubtful/loss bands."
  · services/atomic/financial-spreader@1.0 (1pt)
    "Spread income statement, balance sheet, cash flow → ratios."

L3 — Agent archetypes:
  · libraries/agents/risk-rater@1.0 (1pt)
    "Score a case against a rubric; return band + factors + confidence."
    [tool_signature: pre-computed; consumes service_results bundle]

No matches in L2 / L4 / L5 / L6.
```

## Step 4 — Recommend reuse vs new

For each top match, recommend:

- **★ exact** → instantiate or reuse directly (no new build)
- **· partial** → consider parameterising/extending the existing entry; if scope is broader than the partial match, consider a new entry
- **no matches** → propose a new entry; flag for `/fsi-promote-to-library` once the third instance is built

## Step 5 — Output a structured report

```yaml
intent: "<the input>"
recommendations:
  - layer: 1
    action: reuse
    ref: services/atomic/dscr-calculator@1.0
    score: 3
    rationale: "Exact match: archetype description names DSCR + stress scenarios directly."
  - layer: 3
    action: parameterise
    ref: libraries/agents/risk-rater@1.0
    score: 1
    rationale: "Tangential — archetype is generic; instantiate with rubric=commercial-credit-rubric-v1."
new_build_proposed:
  - none
```

## Anti-patterns to refuse

- Recommending a "new build" without checking each of the six layers explicitly. Always inventory first.
- Scoring on name alone without reading the description (semantic drift).
- Ignoring version pins. Always cite `name@version`.
- Skipping cross-layer checks — sometimes a use-case archetype (L6) covers what looks like an L3 + L5 + L4 stack.
