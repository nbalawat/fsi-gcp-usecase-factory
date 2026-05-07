---
name: console-recommendations
description: Knowledge for building the recommendations console pattern. Auto-invoked when working on UI for use cases where the agent generates suggestions for human disposition (wealth rebalancing, NBA, syndicated waterfall, RCSA recommendations). Shows a queue of recommendations with full impact analysis and inline accept/edit/defer/reject actions.
---

# Recommendations console

The recommendations console serves work where the agent generates suggestions and the human decides whether to act. The user is the decision-maker; the agent is augmenting them.

## When this console fits

- Time horizon: on-demand (user reviews when convenient)
- Unit of work: an agent-generated recommendation
- Audience: advisor, banker, RM, anyone whose work the agent augments
- Headline metric: accept rate

Use cases that fit: #16 wealth rebalancing, #25 customer 360 / NBA, #10 syndicated waterfall (anomaly recommendations), #18 RCSA recommendations.

## Layout

Five visual zones:

1. **Header** — book name, persona, "N awaiting your review" indicator
2. **Metric strip** — book size (AUM/portfolio), recommendations count by urgency, accept rate (30d), drift count, opportunity sizing
3. **Recommendations queue** — top items shown with full impact, lower items shown compact
4. **Right rail** — user's review pattern (% accepted/edited/rejected), agent learning from rejections, safety rails
5. **Footer** — actions: all recommendations, by drift, tax planner, IPS library, trade blotter

## Recommendation card anatomy (urgent/expanded)

```
[urgent badge] [type badge] drafted Xm ago
[Customer/account name] · [size]
[Narrative: agent's recommendation in plain English]

PROPOSED            IMPACT             RESULTING
Sell 940 NVDA      +$248K LTCG        9.5% NVDA
~$1,184,000        offset by $87K     within IPS

● IPS check passed  ● Suitability OK  ● No wash sale  ● Restricted clear

[Accept & route to OMS] [Edit] [Defer] [Reject]    [Open household ↗]
```

Lower-urgency items shown more compact (one-line):
```
[attention] drift   Customer · $X · drift Y%
                    K-trade rebalance · est. tax $Z
                    [Open ↗]
```

## Components used

From the shared library:
- Header strip
- Metric strip
- Case card (recommendation variant — urgent/attention/routine sizes)
- Action button row (accept/edit/defer/reject)
- Safety check pills (IPS / suitability / wash sale / etc.)
- User review pattern widget (right rail)
- Right-rail summary panel

## Configuration

```json
{
  "console": "recommendations",
  "use_case": "wealth_rebalancing",
  "persona": "Senior advisor",
  "metrics": [
    {"id": "aum", "label": "AUM", "unit": "$"},
    {"id": "rec_count", "label": "Recommendations",
     "breakdown": ["urgent", "attention", "routine"]},
    {"id": "accept_rate_30d", "label": "Accepted · 30d", "unit": "%"},
    {"id": "drift_count", "label": "Drift > threshold"},
    {"id": "tax_harvest_available", "label": "Tax harvest available", "unit": "$"}
  ],
  "recommendation_types": [
    {"id": "concentration", "label": "Concentration"},
    {"id": "life_event", "label": "Life event"},
    {"id": "tax_harvest", "label": "Tax harvest"},
    {"id": "drift", "label": "Drift"},
    {"id": "cash_drag", "label": "Cash drag"}
  ],
  "urgency_levels": [
    {"id": "urgent", "color": "#A32D2D"},
    {"id": "attention", "color": "#BA7517"},
    {"id": "routine", "color": "#888780"}
  ],
  "safety_checks": [
    {"id": "ips_check", "label": "IPS check"},
    {"id": "suitability", "label": "Suitability (Reg BI)"},
    {"id": "wash_sale", "label": "Wash sale"},
    {"id": "restricted_list", "label": "Restricted list"},
    {"id": "concentration", "label": "Concentration"}
  ],
  "actions": [
    {"id": "accept", "label": "Accept & route to OMS", "primary": true,
     "destination": "oms_queue"},
    {"id": "edit", "label": "Edit"},
    {"id": "defer", "label": "Defer"},
    {"id": "reject", "label": "Reject"}
  ],
  "right_rail": {
    "panels": ["review_pattern", "agent_learning", "safety_rails"]
  }
}
```

## User review pattern (right rail)

Show the user back to themselves:

```
ACCEPTED AS DRAFTED       119 (73%)
[bar chart: 73%]

ACCEPTED WITH EDITS       23 (14%)
[bar chart: 14%]

DEFERRED                  14 (9%)

REJECTED                  7 (4%)
```

This is calibration. The user sees their own rate and can compare to peers. The agent gets implicit feedback (rejected recs flagged for prompt review).

## Agent learning from rejections (right rail)

When the user rejects multiple recommendations of the same kind, surface the learning:

```
You rejected 3 tax-harvest pairs as too similar to held funds
(substance vs form concern). Agent has incorporated this into
pair selection logic.

[Review feedback ↗]
```

This builds trust. The user sees their feedback closing the loop.

## Safety rails (right rail)

Compliance comfort blanket. List the checks that gate every recommendation:

```
SAFETY RAILS
• IPS check on every recommendation
• Reg BI suitability scoring
• Restricted list enforcement
• Wash sale 30-day window check
• Concentration limits
• No auto-execution · all routes through OMS after your accept
```

## Hard rules

- "Accept" must trigger only the next-step routing (OMS queue, etc.) — never auto-execute
- Safety checks must visibly pass before accept is enabled
- The user's review pattern must be displayed back to them
- Agent learning loop must be visible (builds trust)
- Rejection reasons must be capturable (for agent improvement)

## Anti-patterns to refuse

- Auto-execution of recommendations (Reg BI / fiduciary duty violation)
- Hiding safety check failures (must be visible reason for hold)
- Recommendations without impact analysis (the user can't decide blind)
- Generic "approve" language for actions that should be specific ("accept and route to OMS")
- Hiding the user's accept/reject pattern (calibration is the feature)
