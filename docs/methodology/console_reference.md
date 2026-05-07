# Console reference

The bank's agentic banking platform presents work through **six consoles**. Every one of the 25 use cases lands in one of them. The console determines layout, audience, rhythm, and component vocabulary — not the architecture beneath, which is shared across all six.

This document is the canonical reference for which use case fits which console and how each is built.

---

## Why consoles

Same underlying architecture (handler → atomic services → rules → agent → sinks) presents itself through different surfaces because the *nature* of the work is different. A fraud ops manager and a BSA officer don't want a filtered version of the same screen — they want different consoles built for their specific work.

Six consoles cover all 25 use cases. Each console is built once with discipline, then configured per use case. The platform invests in the chrome (header, breadcrumb, footer actions, metric strip, right rail) and the component library; use case teams configure content.

---

## The six consoles at a glance

| Console | Time orientation | Unit of work | Primary audience | Hero metric |
|---------|------------------|--------------|------------------|-------------|
| **Real-time console** | Now | Transaction | Ops manager | Latency budget |
| **Investigations console** | Hours to days | Investigation / case | Specialist officer | Regulatory clock countdown |
| **Pipeline console** | Days to weeks | Application / case in motion | Operations lead | Cycle time, stuck count |
| **Surveillance console** | Continuous | Position / property / vendor | Risk leader | Risk concentration, drift |
| **Run console** | Periodic (weekly/quarterly) | The run itself | Team lead for the exercise | Progress to deadline |
| **Recommendations console** | On-demand | Agent suggestion | Advisor / authoring user | Accept rate |

---

## Console 1 — Real-time

**Shape:** vertical stream of decisions flowing in real time. Sub-second latency. Volume-dominant.

**Audience:** payment ops manager, fraud ops manager. Their job is keeping rails healthy. They're not reading every transaction; they're scanning for anomalies and watching aggregate metrics.

**What's on screen:**
- Throughput counter (transactions per second), latency budget gauge (P50, P95, P99)
- Per-rail mini-charts (RTP and FedNow side by side, for example)
- Tabular decision stream — timestamp, rail, merchant, amount, result, latency
- Decline-by-reason breakdown
- SLA posture (% of latency budget used)

**Human role:** almost none. Gray-zone cases route to async fraud agents, not human queues. Humans intervene only on infrastructure issues or pattern shifts.

**Use cases that fit:**
- #4 payment fraud detection
- #17 RTP / FedNow processing
- #21 account takeover detection

---

## Console 2 — Investigations

**Shape:** vertical list of cases under investigation, each with deep agent reasoning visible. Time horizon hours to days. Regulatory clocks dominate.

**Audience:** BSA officer, dispute analyst, complaint analyst, trade ops officer. Their job is to investigate, decide, and meet regulatory deadlines.

**What's on screen:**
- Cases in agent flow with named regulatory clocks (FinCEN 30d, Reg E 10d, CFPB 15d) counting down
- Each case shows agent reasoning step-by-step with confidence scores
- Entity graph or evidence visualization per case
- Action buttons inline: approve, edit, reject, dismiss
- Closed-without-filing examples shown deliberately as evidence the agent dismisses false positives

**Human role:** central. Officer reviews, edits, approves the agent's work product. Regulatory clock is the constraint.

**Use cases that fit:**
- #2 BSA / AML SAR filing
- #6 card disputes
- #9 Reg E / Z compliance
- #11 trade finance LC
- #12 customer complaint triage

---

## Console 3 — Pipeline

**Shape:** horizontal flow of cases through stages. Time horizon days to weeks. Multiple human checkpoints visible.

**Audience:** operations lead — mortgage ops, loan ops, KYC ops, treasury ops. Their job is keeping the funnel flowing and unblocking stuck cases.

**What's on screen:**
- Six (typically) stages laid out left-to-right, agent-driven stages and human checkpoints visually distinct
- Each stage shows count and individual case cards
- "Currently moving" feed of cases transitioning between stages
- "Stuck cases" panel — cases too long in one stage, with the specific reason
- Cycle time and throughput metrics in the header

**Human role:** distributed across multiple checkpoints. Underwriters, closers, RMs, ops staff each touch the case at different stages.

**Use cases that fit:**
- #1 commercial loan underwriting
- #3 deposit account opening / KYC
- #5 mortgage origination
- #8 treasury / cash management onboarding
- #15 retail loan collections / workout

---

## Console 4 — Surveillance

**Shape:** 2D state grid. Continuous re-evaluation against a portfolio. Unit is a position, not a flow.

**Audience:** chief credit officer, portfolio manager, risk officer. Their job is finding where risk is concentrating that wasn't there last quarter.

**What's on screen:**
- Heatmap (sector × geography, or risk tier × asset type) with color encoding the metric of interest
- Cells show exposure and count; color shows trajectory or current state
- Toggle between metrics (DSCR, LTV, occupancy for CRE; match rate, aging for recon)
- Drill-in property/position list for any cell
- Right rail: agent flags from the most recent sweep, with cited sources and confidence
- "Agent now" panel showing the current sweep in progress

**Human role:** review agent flags, investigate outliers, make portfolio-level decisions.

**Use cases that fit:**
- #7 CRE portfolio surveillance
- #14 account reconciliation exception management
- #19 commercial deposit pricing / relationship profitability
- #23 vendor / TPRM
- #25 customer 360 / NBA (segment view variant)

---

## Console 5 — Run

**Shape:** progress through a periodic exercise. Unit is the run itself, not individual cases. Time horizon days to weeks per cycle, repeated quarterly or annually.

**Audience:** team lead for the exercise — allowance team lead for CECL, regulatory reporting lead for Call Report, model risk lead for MRM.

**What's on screen:**
- Header dominated by deadline countdown and progress (segments done, qualitative factors, etc.)
- Center column: segments or work units, three states — complete with results, in-flight with progress bars and rotating status, pending
- Variance to prior period as the headline number
- Right rail: qualitative factor authoring queue, board-ready outputs, audit trail
- Approval and review states tracked per work unit

**Human role:** lead orchestrates; SMEs author qualitative factors; committee reviews and approves.

**Use cases that fit:**
- #13 model risk / validation
- #20 regulatory reporting (Call Report / FR Y-9C)
- #22 CECL / allowance estimation
- #24 ATM / branch cash forecasting (recurring batch variant)
- #18 op risk / RCSA (recurring assessment cycle)

---

## Console 6 — Recommendations

**Shape:** queue of agent-generated suggestions for human accept / edit / defer / reject. Unit is the recommendation itself.

**Audience:** advisor, banker, RM — anyone whose work the agent is augmenting with proactive suggestions. The recommendation feed is *their work*.

**What's on screen:**
- Recommendations sorted by urgency (urgent / attention / routine)
- Each recommendation shows full proposed action, impact analysis (tax, allocation, risk), safety check results (IPS, suitability, restricted list, wash sale)
- Inline action buttons: accept, edit, defer, reject
- Right rail: user's review pattern (% accepted, % edited, % rejected) — shown back to them
- Memo on agent learning from rejections — "you rejected X kind 3 times; agent has updated its logic"
- Safety rails panel listing the regulatory and policy checks every recommendation passes

**Human role:** the user is the decision-maker. Agent prepares, human disposes.

**Use cases that fit:**
- #10 syndicated loan agency / waterfall (anomaly recommendations variant)
- #16 wealth management portfolio rebalancing
- #25 customer 360 / NBA (advisor recommendation variant)
- Banker copilot deployments across multiple use cases

---

## Picking the right console

When a new use case enters the platform, the first design question is: **which console?** A short diagnostic:

| Question | If yes, lean toward |
|----------|---------------------|
| Is the work sub-second / volume-dominant? | Real-time |
| Does each unit need investigation against a regulatory clock? | Investigations |
| Does each unit move through stages over days/weeks with multiple human checkpoints? | Pipeline |
| Is the unit a position being continuously re-evaluated? | Surveillance |
| Is the work a periodic exercise toward a deadline? | Run |
| Is the agent generating suggestions for a human to dispose of? | Recommendations |

If two consoles seem to fit, the use case is probably composite. Most use cases that look composite either:
- Decompose into two use cases that each fit one console cleanly, or
- Have a primary console and a secondary view (the pipeline console for the underwriter, the investigations console for the credit officer reviewing exceptions)

---

## Component vocabulary across consoles

The six consoles share a small library of components. Build these once; reuse across all six.

| Component | Used in |
|-----------|---------|
| Header strip (breadcrumb, persona, status pill) | All six |
| Metric strip (5 numbers across) | All six |
| Live event ticker | Real-time, Investigations (activity panel) |
| Case card (compact / detail / expanded) | Investigations, Pipeline, Recommendations |
| Agent reasoning panel | Investigations, Surveillance, Run, Recommendations |
| Regulatory clock | Investigations, Run |
| Pipeline stage column | Pipeline |
| 2D heatmap grid | Surveillance |
| Progress bar with rotating status | Run, Surveillance (sweep), Recommendations (agent now) |
| Stuck / exception panel | Pipeline, Surveillance, Run |
| Action button row (accept / edit / defer / reject) | Investigations, Recommendations |
| Right-rail summary panel | All six |
| Footer action bar | All six |

Roughly 12 components. Every console assembles them differently. New use case → pick console → configure components, no UI built from scratch.

---

## How consoles map to the rest of the methodology

Consoles are the UI dimension of the platform. They sit on top of:

- The 5-step paradigm (handler → atomic services → rules → agent → sinks)
- The five HITL patterns (ambient, notify, approval gate, copilot, conversational)
- The two models (Claude Opus 4.7, Gemini 3.1 Flash)
- The Cloud Workflows orchestration layer
- The agent platform (ADK + Agent Runtime + Memory Bank)
- The data plane (BigQuery + Bigtable + Cloud SQL)

Each console determines which HITL patterns apply most heavily — for example, the Real-time console is mostly ambient with notify; the Investigations console is approval gate with copilot; the Recommendations console is approval gate by design.

---

## Build sequence

If building all six in parallel is impractical, sequence them by reuse pressure:

| Order | Console | Why this order |
|-------|---------|---------------|
| 1 | Investigations | Highest use case reuse (5 use cases); covers complaint triage as the recommended first deployment |
| 2 | Real-time | Second-highest reuse for real-time (3 use cases); covers payment fraud |
| 3 | Pipeline | Covers commercial loan as the third recommended use case; teaches multi-day workflow patterns |
| 4 | Surveillance | Distinct shape (2D grid); reusable across CRE, recon, TPRM |
| 5 | Run | Distinct shape (progress to deadline); covers CECL, reg reporting |
| 6 | Recommendations | Most polished UX requirements; benefits from earlier work |

By console #4 the component library is mature. Console #5 and #6 build faster because they reuse heavily.

---

## Vocabulary

- **The bank** uses "console" as the product name. Operators say "open the fraud console," "the SAR investigations console," "the CECL run console."
- **Architects and engineers** use "console pattern" when discussing methodology. "This use case fits the surveillance console pattern." "We need a new console pattern for this work shape."
- **Configuration** is per-use-case. The pipeline console for mortgage looks different from the pipeline console for commercial loan — same chrome, same component library, different content.
