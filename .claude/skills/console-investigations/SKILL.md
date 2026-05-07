---
name: console-investigations
description: Knowledge for building the investigations console. Auto-invoked when working on UI for case-investigation use cases (BSA/AML SAR, disputes, complaints, Reg E, trade finance LC). Shows cases under investigation with regulatory clocks, deep agent reasoning, evidence, and inline accept/edit/reject actions.
---

# Investigations console

The investigations console serves work where each case is a discrete investigation against a regulatory clock, requiring human review and disposition.

## When this console fits

- Time horizon: hours to days
- Unit of work: a case / investigation
- Regulatory clocks dominate (FinCEN 30d, Reg E 10d, CFPB 15d)
- Audience: BSA officer, dispute analyst, complaint analyst, trade ops officer

Use cases that fit: #2 BSA/AML SAR, #6 disputes, #9 Reg E/Z, #11 trade finance LC, #12 complaint triage.

## Layout

Five visual zones:

1. **Header** — use case name, persona, count of cases under regulatory clock pressure
2. **Metric strip** — open cases, filings completed, agent triage rate (% false positive eliminated), avg time to file
3. **Cases list** — one row per case in agent flow, with named regulatory clock, agent reasoning summary, inline action buttons
4. **Right rail** — active case agent reasoning step-by-step with confidence per step, entity graph or evidence visualization, participants list
5. **Footer** — actions: all cases, filed today, closed without filing, pattern library

## Case row anatomy

```
[clock badge] [type badge] [case ID]
  [Customer name and one-line summary]
  ● [agent thinking now] · [confidence] · [tokens used]
  Step X/Y · Confidence Z · Tokens K
  [Open ↗]
```

Inline action buttons (when ready for disposition):
- Approve & file (green primary)
- Edit narrative (secondary)
- Reject (secondary)
- Open full ↗ (right-side)

## Components used

From the shared library:
- Header strip
- Metric strip
- Case card (detail variant for top cases, compact for lower ones)
- Regulatory clock component
- Agent reasoning panel (step-by-step with confidence)
- Entity graph / evidence visualization
- Action button row
- Right-rail summary panel

## Configuration

```json
{
  "console": "investigations",
  "use_case": "bsa_aml_sar",
  "persona": "BSA Officer",
  "clocks": [
    {"id": "fincen_30d", "label": "FinCEN", "duration_h": 720, "alert_at_h": 24},
    {"id": "fincen_60d", "label": "FinCEN extended", "duration_h": 1440, "alert_at_h": 48}
  ],
  "case_types": [
    {"id": "structuring", "label": "Structuring"},
    {"id": "trade_based", "label": "Trade-based"},
    {"id": "cash_intensive", "label": "Cash intensive"},
    {"id": "false_positive", "label": "False positive"}
  ],
  "metrics": [
    {"id": "open_cases", "label": "Open cases"},
    {"id": "sars_filed_30d", "label": "SARs filed (30d)"},
    {"id": "agent_triage_rate", "label": "Agent triage", "unit": "%"},
    {"id": "avg_time_to_file", "label": "Avg time to file", "unit": "h"}
  ],
  "actions": [
    {"id": "approve_file", "label": "Approve & file", "primary": true},
    {"id": "edit_narrative", "label": "Edit narrative"},
    {"id": "reject", "label": "Reject"}
  ],
  "right_rail": {
    "active_case_panels": ["agent_reasoning", "entity_graph", "participants"]
  }
}
```

## Regulatory clock display

The clock is the most important visual element after the case description. Display:
- Named ("FinCEN 06:12:47" not "SLA 6h"). The officer thinks in regulatory terms.
- Counting down in real time (1-second updates)
- Color escalates: gray > 24h, amber 1-24h, red < 1h

The bank uses a `RegulatoryClock` component that takes a duration and current case-start time.

## Agent reasoning panel (right rail)

For the top-of-list (most urgent) case, show step-by-step what the agent did:

```
TRIAGE     14:22:08
matched 14 deposits to structuring threshold · conf 0.91

ENTITY     14:22:14
resolved 3 beneficial owners

ENTITY     14:22:19
B.O. 1 ↔ B.O. 2 same address (2024 amendment)

MEDIA      14:22:31
B.O. 1 in FinCEN 2024-A007 advisory · conf 0.94

NARRATIVE  14:22:45
drafting facts section · 1,840 words · conf 0.87
```

Each step has a small badge (TRIAGE, ENTITY, MEDIA, NARRATIVE), a timestamp, the action, and confidence. Updates as the agent works.

## Entity graph (right rail)

For investigations that have entity relationships (AML, fraud rings, vendor TPRM), show the graph:
- Subject entity in center
- Connected entities (beneficial owners, counterparties, related parties)
- Edges show relationships (shared address, same ownership, transactional)
- Highlight the edge that justifies the agent's flag

SVG-based. Include a small legend.

## "Closed without filing" cases

Show some recently closed-without-filing cases at the bottom of the list. This is deliberate — it's evidence the agent dismisses false positives. Stat ("82% false positive elimination") backs this up.

## Hard rules

- Regulatory clocks must count down second-by-second
- Action buttons must be inline for fast disposition
- Never auto-file — humans always dispose
- Agent reasoning must be visible without leaving the page (right rail)
- Closed-without-filing cases shown for trust building

## Anti-patterns to refuse

- Generic SLA labels instead of named regulatory clocks
- Hidden agent reasoning (must be visible inline)
- Auto-filing without human approval (Reg E and FinCEN both require human attestation)
- More than 4 actions in the inline button row (decompose if more needed)
