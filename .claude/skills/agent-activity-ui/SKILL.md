---
name: agent-activity-ui
description: The pattern for making agent activity visible — live during execution, audited after. Auto-invoked when files matching `agent-audit/*`, `*audit-trail*`, `*audit-export*`, `*reasoning-panel*`, `*agent-action*`, `*audit-totals*`, `*citation-list*` are read, written, or edited; also when authoring an agent that writes `agent_action` events. Codifies the live "agent thinking" tile, the banker view ↔ engineer view toggle, the per-action drill-in (inputs / reasoning / tools / output / citations), and the regulator-ready audit-trail panel that ships with every use case.
---

# Agent activity UI

You are about to read, write, or edit code that surfaces agent activity
— either the live "agent X is currently reasoning" UX, or the after-
the-fact audit trail. This skill is the playbook for **Principles 3
and 4** of `agentic-ui-principles.md`: agent activity is visible live,
and the audit trail is the SOP across every use case.

**Why this matters:** for a CCO to sign off on an agentic workflow, they
must see what the AI did — every step, every claim, every citation. For
SR 11-7 model risk management, the audit trail is the artifact an
examiner asks for. For the bank to defend a denied-loan decision in
court, the audit trail is the evidence. This skill turns those
requirements into a uniform UX that ships with every use case.

---

## When this skill auto-invokes

- `usecases/<uc>/ui/components/agent-audit/**`
- Any file matching `*audit-trail*`, `*audit-export*`, `*reasoning-panel*`,
  `*agent-action*`, `*audit-totals*`, `*citation-list*`,
  `*replay-button*`, `*view-mode-toggle*`
- `app/audit/**` route files
- When `adk-agent-design` is loaded (this skill ensures the agent emits
  the fields the audit UI needs)
- When `event-spine-ui` renders an agent-action row

---

## The contract — what every agent action carries

The audit-trail UI is downstream of a strict event payload. Every
agent invocation MUST write a row to `application_events` with
`event_type='agent_action'` and a JSONB payload conforming to:

```jsonc
{
  "agent_role": "customer-concentration-analyzer",   // canonical role
  "agent_version": "1.2",
  "model": "gemini-2.5-pro",                          // exact model id
  "model_params": {"temperature": 0, "max_tokens": 4000, "thinking_effort": "high"},
  "started_at": "2026-05-07T14:23:11.842Z",
  "completed_at": "2026-05-07T14:23:18.219Z",
  "latency_ms": 6377,
  "tokens": {"input": 12480, "output": 1850, "thinking": 920},
  "cost_usd": 0.187,
  "memory_scope": "borrower",
  "memory_keys_read": ["borrower_id:LECO", "naics:333992"],
  "tools_invoked": [
    {
      "name": "peer-benchmarker",
      "url": "https://fsi-atomic-peer-benchmarker-...",
      "started_at": "...",
      "latency_ms": 240,
      "input_hash": "...",
      "output_hash": "..."
    }
  ],
  "inputs_summary": "10-K excerpt pages 18-23 (customer disclosures) + AR aging Q4-2025",
  "reasoning_trace": "<short banker-friendly summary> + <full thinking block, redactable>",
  "output_summary": "Top-1 customer = 32% of revenue; HHI = 1840; flag SM upgrade trigger.",
  "output_full": {"top_5_pct": [32, 18, 12, 9, 7], "hhi": 1840, "alerts": ["..."]},
  "confidence": 0.91,
  "citations": [
    {
      "source": "10-K_2025.pdf",
      "page": 23,
      "excerpt": "Customer A represented 32% of consolidated net sales..."
    }
  ]
}
```

The schema lives at `infra/shared/schemas/agent-action.schema.json` and
is shared across every use case. CI gate validates every `agent_action`
payload against it.

If the agent doesn't emit a field, the UI shows `—` (em-dash) for
optional, or the row is flagged red for required (`agent_role`, `model`,
`started_at`, `completed_at`, `latency_ms`, `output_summary` are
required; the rest are optional).

---

## Live agent activity — the four states of a tile

In `<PipelineActivity>` (event spine), each agent row is a tile that
flips through four states:

```
1. PENDING                    The orchestrator hasn't invoked yet.
   ─────────                  No tile rendered.

2. RUNNING                    Agent invoked; not yet returned.
   ╔══════════════════════╗    Show: spinner + role + started_at +
   ║ ◐ risk-rater         ║    "in flight · X.Xs · NN K tokens in".
   ║   running · 4.2s     ║    Pulse on the "running" badge.
   ║   12K tokens in      ║
   ╚══════════════════════╝

3. COMPLETED                  Agent returned; output_summary lands.
   ┌──────────────────────┐    Show: role · model · latency · cost +
   │ ✓ risk-rater         │    one-line summary.
   │   4.8s · $0.041 · 91%│    Green tick; click expands the full panel.
   │   ⏵ Pass — Tier 1…   │
   └──────────────────────┘

4. FAILED / STUBBED           Agent threw / fell back to stub.
   ┌──────────────────────┐    Show: role · error / "STUBBED" badge ·
   │ ✕ risk-rater         │    reason. Banner-warn on the page.
   │   stubbed (no key)   │
   │   — fallback active  │
   └──────────────────────┘
```

State transitions animate (200ms ease-out tint, `--t-mod` token).

**Implementation:** `<AgentActivityTile>` lives at
`usecases/<uc>/ui/components/agent-audit/agent-action-row.tsx` (per-UC
during the build; promote to `@fsi-bank/components` after Rule of
Three).

---

## The audit trail panel — the SOP

Every use case ships THE SAME audit-trail panel. An examiner learns
it once and uses it on every UC.

### Panel layout

```
┌────────────────────────────────────────────────────────────────────┐
│ Audit trail · ba156430-…  · 13 agents · 47 tool calls · 4 rules    │  Totals
│                          · 73s · $0.84   [Banker view ▾] [⬇ JSON]  │  + view-toggle + export
├────────────────────────────────────────────────────────────────────┤
│ Filter:  [agent ▾] [status ▾] [latency >X] [cost >Y] [search…]     │  Filter bar
├────────────────────────────────────────────────────────────────────┤
│ 14:23:18  ✓ document-classifier   gemini-2.5-flash · 1.8s · $0.003 │  Chronological list
│           ⏵ "Identified 4 docs: 10-K, 10-Q, audited stmts, AR aging"│  one row per action
│                                                                     │
│ 14:23:21  ✓ document-extractor    gemini-2.5-pro · 4.2s · $0.012   │
│           ⏵ "Extracted 47 financial fields with 96% confidence"     │
│                                                                     │
│ 14:23:25  ✓ customer-concentration gemini-2.5-pro · 6.8s · $0.041  │
│           ⏵ "Top-1 = 32%; HHI = 1840; flag SM trigger"             │
│           [expand ▾]                                                │
│                                                                     │
│           ┌─ Inputs ──────────────────────────────────────────────┐ │  Expanded (banker view)
│           │ • 10-K excerpt pages 18-23 (customer disclosures)     │ │
│           │ • AR aging Q4-2025                                     │ │
│           ├─ Reasoning ───────────────────────────────────────────┤ │
│           │ Customer A's 32% concentration is above the 25%       │ │
│           │ Special Mention trigger threshold per bank policy…    │ │
│           │ [Show full thinking ▾]                                │ │
│           ├─ Tools invoked ───────────────────────────────────────┤ │
│           │ ⏵ peer-benchmarker · 240ms · {hash} → {hash}          │ │
│           ├─ Output ──────────────────────────────────────────────┤ │
│           │ HHI: 1840                                             │ │
│           │ Top-5%: [32, 18, 12, 9, 7]                            │ │
│           │ Alerts: [Special Mention trigger]                      │ │
│           ├─ Citations ───────────────────────────────────────────┤ │
│           │ ⏵ 10-K_2025.pdf p.23: "Customer A represented 32%…"   │ │
│           └────────────────────────────────────────────────────────┘ │
│ ...                                                                 │
└────────────────────────────────────────────────────────────────────┘
```

### The required pieces

| Region | Owner component | Notes |
|---|---|---|
| Totals strip | `<AuditTotals>` | Sum of agents, tools, rules, latency, cost |
| View toggle | `<ViewModeToggle>` | Banker / Engineer; persisted in cookie |
| Export | `<AuditExport>` | JSON (regulator-shareable) + CSV (analyst-shareable) |
| Filter bar | `<AuditFilterBar>` | Filter by agent / status / latency / cost / search |
| Action row | `<AgentActionRow>` | Collapsed default; one line per action |
| Reasoning panel | `<ReasoningPanel>` | Show full thinking; collapsible |
| Tools nested | `<ToolInvocation>` | Recursive — tools can have sub-events |
| Citations | `<CitationList>` | Resolves to source excerpts on click |
| Replay button | `<ReplayButton>` | Re-run agent with same inputs (idempotency check; engineer-only) |

All implementations live at
`usecases/credit-memo-commercial/ui/components/agent-audit/` —
canonical reference. Promote to `@fsi-bank/components` once a second
use case builds against the same shape (Rule of Three).

### Banker view vs Engineer view

Toggled via `<ViewModeToggle>`; cookie-persisted across sessions.

| Banker view (default for credit officer / compliance) | Engineer view (default for platform team) |
|---|---|
| Output summary as banker prose | Full output JSON |
| Reasoning trace as a paragraph | Full thinking block + prompt + completion |
| Citations as readable excerpts | Citations + raw evidence hashes |
| Tools as named, latency only | Tools + URLs + input/output hashes + replay |
| No model params | Model + temperature + max_tokens + thinking_effort |
| No cost detail (just total) | Per-action cost breakdown |

---

## Standalone audit route

Every use case ALSO ships `app/audit/[application_id]/page.tsx` — a
full-page audit view, deep-linkable, regulator-shareable. Same panel
as the in-case audit tab, but with:

- A header showing the use case + application ID + final decision +
  human approver + timestamp
- A printable layout (`⌘P` produces a paginated PDF)
- A "Sign off" capture if the user is a senior credit officer / CCO
  — captures their signature + reason + timestamp

```ts
// usecases/<uc>/ui/app/audit/[id]/page.tsx (in spirit; actual lives in pipeline-console)
export default async function AuditPage({ params }: { params: { id: string } }) {
  const events = await fetchAuditEvents(params.id);
  const application = await fetchApplication(params.id);
  return (
    <AuditPanel
      applicationId={params.id}
      events={events}
      application={application}
      mode="standalone"
    />
  );
}
```

---

## Export formats

`<AuditExport>` produces two files.

### JSON (regulator-shareable)

```jsonc
{
  "schema_version": "1.0",
  "use_case_id": "credit-memo-commercial",
  "application_id": "ba156430-...",
  "decision": "APPROVE",
  "decision_made_at": "2026-05-07T14:24:55Z",
  "decision_made_by": {
    "human_approver": "user:underwriter:jdoe",   // null if fully automated
    "human_signature": "...",                     // e164 phone or eIDAS sig
    "agent_recommendation": "approve"
  },
  "totals": {"agents": 13, "tool_calls": 47, "rules": 16, "latency_ms": 73000, "cost_usd": 0.84},
  "events": [
    /* every application_events row, validated against agent-action.schema.json */
  ],
  "citations_resolved": [
    /* every citation with the source excerpt inlined */
  ]
}
```

### CSV (analyst-shareable)

One row per agent action; columns:
`timestamp, agent_role, model, latency_ms, tokens_in, tokens_out, cost_usd, confidence, output_summary, citation_count`.

Both formats validate against
`infra/shared/schemas/audit-trail.schema.json`. CI gate runs the
validation in `scripts/test_audit_export.sh`.

---

## Replay

For engineer view only: clicking `<ReplayButton>` re-invokes the agent
with the same inputs. The orchestrator MUST be idempotent (per
product-build-discipline Rule 7) — replay should produce the same
output (within model temperature variance). The replay's output is
diffed against the original; if they differ in structure, that's a
flag.

Replay is gated behind `feature_flags.replay_enabled` and behind the
engineer view — credit officers should not see this control.

---

## Citation resolution

Every citation in the audit trail must be **clickable and resolvable**:

- Click → popover with the source excerpt highlighted
- "View in document" link → opens the source 10-K (or peer table, or
  regulation page) with the relevant lines highlighted
- Hover → preview tooltip (small, 200ms delay)

The `<CitationList>` component handles this; it requires the citation's
`source` and `page` to resolve. The `citation-context.tsx` provider
(per-UC) fetches the actual source excerpt on demand from
`application_artifacts` or GCS.

If a citation fails to resolve, it's rendered with a red dot + tooltip
"source not found" — never silently ignored.

---

## "Top-notch" checklist for agent activity UI

Before declaring an agent-activity screen done:

- [ ] Live tile state reflects agent state (pending / running / completed / failed)
- [ ] Running state shows tokens-in count + elapsed time, not a generic spinner
- [ ] Completed state has a banker-prose one-liner summary
- [ ] Click-to-expand reveals inputs / reasoning / tools / output / citations
- [ ] View-mode toggle works (banker vs engineer)
- [ ] Cost + latency + confidence are surfaced
- [ ] Citations resolve to source excerpts (not dead links)
- [ ] Audit trail full-page route (`/audit/<id>`) deep-links and prints clean
- [ ] Export produces valid JSON + CSV
- [ ] Stubbed agents are visually distinct (red badge, banner)
- [ ] Replay button visible only in engineer view
- [ ] Filter bar works (agent / status / latency / cost / search)
- [ ] Totals strip matches sum of underlying events

This is the bar.

---

## CI gates

- **`scripts/lint_agent_action_schema.py`** — every `agent_action`
  event payload in production validates against
  `agent-action.schema.json`. CI fails on schema drift.
- **`scripts/lint_audit_export_schema.py`** — every audit export
  validates against `audit-trail.schema.json`.
- **`scripts/test_ui_smoke.mjs --check=audit-trail`** — opens
  `/audit/<id>` for a fixture case, asserts: banker-view toggle works,
  expand/collapse works, export downloads, no `<button>` without
  `onClick`.
- **Rule 4 of product-build-discipline** — citation density ≥ 0.80
  for any artifact tagged `regulator_visible: true`.

---

## Anti-patterns to refuse

- **Agent output rendered as raw JSON** — banker prose with citations
  required (Principle 3).
- **Stubbed agents silently — no banner, no flag** — must be loud
  (product-build-discipline Rule 3).
- **Per-use-case audit panel layout** — every UC uses the same panel.
  If a UC needs something different, propose extending the shared
  primitive.
- **Citations that don't resolve** — every citation must click through
  to its source excerpt.
- **No engineer view** — debugging requires the raw prompt/completion;
  banker view alone leaves engineers blind.
- **No print-clean audit page** — examiners ask for printed copies; if
  `⌘P` produces garbage, the audit trail is not regulator-ready.
- **No `replay` for non-deterministic agents without idempotency check**
  — replay's whole point is verifying determinism; without the diff
  it's just re-burning LLM budget.

---

## Onboarding for a new use case

1. Confirm `agent-action.schema.json` covers your UC's agents (it should
   — it's intentionally generic).
2. The orchestrator writes one `application_events` row per agent
   invocation with `event_type='agent_action'` and a payload conforming
   to the schema.
3. Copy `usecases/credit-memo-commercial/ui/components/agent-audit/` to
   your UC's `ui/components/agent-audit/`. Adjust labels for your UC's
   agent role names.
4. Add `app/audit/[id]/page.tsx` to your console (canonical: pipeline-
   console).
5. Run `scripts/test_ui_smoke.mjs --check=audit-trail` against your
   fixtures.

After two more use cases adopt the same components, promote
`<AuditTotals>`, `<ViewModeToggle>`, `<AuditExport>`, `<AuditFilterBar>`,
`<AgentActionRow>`, `<ReasoningPanel>`, `<ToolInvocation>`,
`<CitationList>` to `ui/packages/components/` and import from
`@fsi-bank/components`.

---

## Reference

- Canonical implementation:
  `usecases/credit-memo-commercial/ui/components/agent-audit/`
- The agent-emits-the-fields contract:
  `services/orchestrator-credit-memo/main.py:_invoke_agent` and
  `_write_event(... 'agent_action' ...)`
- `docs/methodology/agentic-ui-principles.md` — Principles 3 + 4
- `docs/methodology/ui-standards.md` §2 (primitives) and §4
  (behavior gates)
- `docs/methodology/product-build-discipline.md` Rule 3 (loud stubs),
  Rule 19 (citations)
