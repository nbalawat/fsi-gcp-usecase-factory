---
name: event-spine-ui
description: The pattern for surfacing a live Pub/Sub / event-stream backbone in the UI so users see the system process work in real time. Auto-invoked when files matching `app/api/live/*`, `*sse*`, `*-stream*`, `pipeline-activity*`, `live-queue*`, `case-auto-refresh*`, `event-stream*`, or `live-data*` are read, written, or edited. Codifies the SSE backbone, stage-chip motion, event grouping, and drill-into-event panel — the difference between "looks live" and "is live".
---

# Event-spine UI

You are about to read, write, or edit code that surfaces the live
event spine of a use case. This skill is the playbook for **Principle
1** of `agentic-ui-principles.md`: the event stream IS the primary
fact, and the UI surfaces it.

This is the pattern that turns a "screenshot of a queue" into "watch
8 applications fly through 8 services × 16 rules × 13 agents in real
time". A demo without this falls flat; a demo with it turns a CCO's
head.

---

## When this skill auto-invokes

Any of these file paths trigger this skill:

- `usecases/<uc>/ui/components/{pipeline-activity,live-queue-table,case-auto-refresh,event-stream}*`
- `usecases/<uc>/ui/lib/live-data*`
- `ui/apps/<console>/app/api/live/**`
- `ui/apps/<console>/lib/live-stream*`
- Any file matching `*sse*`, `*event-stream*`, `*live-stream*`

It also auto-invokes when `/new-use-case` reaches the Step 4 (UI
scaffold) for any use case whose `console.yaml` declares a live data
channel.

---

## The four layers of the event spine

Every live agentic UI has the same four layers. They compose:

```
┌─────────────────────────────────────────────┐  Layer 4 — UI panels
│ Live queue table · pipeline-activity panel  │  (stage chips, rows,
│ stage rail · live status badge              │  drill-in)
├─────────────────────────────────────────────┤
│ React hooks: useLiveQueue, useLiveCase,     │  Layer 3 — client hooks
│ useLiveAuditTrail, useLiveStatus            │
├─────────────────────────────────────────────┤
│ /api/live/stream  (SSE endpoint, one per    │  Layer 2 — server SSE
│ console)                                    │
├─────────────────────────────────────────────┤
│ Cloud SQL row writes by services + agents,  │  Layer 1 — event source
│ application_state_changed Pub/Sub topic     │  (the actual events)
└─────────────────────────────────────────────┘
```

---

## Layer 1 — the event source (server-side)

The event stream is produced by the orchestrator + atomic services +
agents writing to two tables:

- `application_state` — current stage, decision, risk_band, last_event_at
- `application_events` — append-only log of every step (event_type,
  service_name, payload JSONB, occurred_at, latency_ms)

Whenever a row in `application_state` changes, the orchestrator
publishes a small notification message to the Pub/Sub topic
`application_state_changed`:

```python
def _publish_state_changed(app_id: str, stage: str) -> None:
    publisher.publish(
        topic="application_state_changed",
        data=json.dumps({"application_id": app_id, "stage": stage}).encode(),
    )
```

This is the single fact the UI subscribes to. Everything else is read
from Cloud SQL on demand.

---

## Layer 2 — the SSE endpoint (server)

One SSE endpoint per console: `app/api/live/stream/route.ts`. It:

1. Subscribes to `application_state_changed` (Pub/Sub pull / streaming
   pull).
2. On each notification, fetches the current state of the affected
   row from Cloud SQL.
3. Emits a `data: {...}` line on the SSE stream to every connected
   client.

Skeleton (Next.js App Router):

```ts
// ui/apps/<console>/app/api/live/stream/route.ts
import { NextRequest } from "next/server";
import { subscribeStateChanged } from "@/lib/live-stream";

export const runtime = "nodejs";  // streaming, no edge

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          new TextEncoder().encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      // 1. On connect, send a snapshot of current state
      send("snapshot", await fetchCurrentSnapshot());

      // 2. Subscribe to state changes; forward each delta
      const unsub = subscribeStateChanged(async (msg) => {
        const row = await fetchOne(msg.application_id);
        send("delta", row);
      });

      // 3. Heartbeat every 25s so proxies don't time out
      const hb = setInterval(() => send("ping", { ts: Date.now() }), 25_000);

      // 4. Cleanup
      req.signal.addEventListener("abort", () => {
        clearInterval(hb);
        unsub();
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
```

**Non-negotiables:**

- One SSE endpoint per console — don't fragment into per-page streams.
- Heartbeat every 25s — Cloud Run idle timeout is 30s for streaming.
- Snapshot on connect — clients render immediately, then receive deltas.
- Unsubscribe on `req.signal.abort` — avoid zombie subscribers in Pub/Sub.

---

## Layer 3 — client hooks

Hooks live in `usecases/<uc>/ui/lib/live-stream.ts` (use-case-specific
data shape). They wrap `EventSource` and expose a typed React state:

```ts
// usecases/<uc>/ui/lib/live-stream.ts
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useLiveQueue(): { rows: ApplicationStateRow[]; status: "live" | "stale" | "down" } {
  const [rows, setRows] = useState<ApplicationStateRow[]>([]);
  const [status, setStatus] = useState<"live" | "stale" | "down">("live");
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource("/api/live/stream");
    es.addEventListener("snapshot", (e) => setRows(JSON.parse(e.data).rows));
    es.addEventListener("delta", (e) => {
      const row = JSON.parse(e.data) as ApplicationStateRow;
      setRows((prev) => upsertById(prev, row));
      router.refresh();    // also re-fetch Server Components on the page
    });
    es.addEventListener("ping", () => setStatus("live"));
    es.onerror = () => setStatus("down");
    return () => es.close();
  }, [router]);

  return { rows, status };
}
```

Use cases also commonly have `useLiveCase(applicationId)` and
`useLiveAuditTrail(applicationId)` for per-case streams (filter the
deltas client-side by `application_id`).

**Non-negotiables:**

- Hook MUST call `router.refresh()` on every delta — Server Components
  must re-fetch (Rule 4.11 from ui-standards).
- Hook handles `onerror` — `<LiveStatusBadge>` flips to `down` so the
  user knows the channel is broken.
- Hook tears down `EventSource` on unmount — `return () => es.close()`.

---

## Layer 4 — UI panels

Three canonical UI primitives consume the hooks. Every console
implements each:

### 4a. `<LiveQueueTable>` — the home view

A table whose rows update in place as the SSE stream pushes deltas.
Each row shows: borrower / loan_id, current stage (chip), risk band,
last activity (relative time), submitted (relative + absolute on
hover).

The chip transitions color + emits a 200ms ease-out tint when the
stage changes. New rows fade in from the top with a 30ms stagger.

**Implementation:** `usecases/credit-memo-commercial/ui/components/live-queue-table.tsx`.
**Width budget:** full width.

### 4b. `<PipelineActivity>` — the per-case event stream

A grouped, time-ordered list of every event written to
`application_events` for the selected case. Events are grouped by
business stage (intake / spreading / policy / drafting / approval /
posting). Each row shows: event title (banker label), service or
agent name (banker label), latency, optional cost, expand-to-see
inputs/outputs.

This is **the canonical "watch the system work" panel**. The credit
officer scrolls through and sees:

```
14:23:04  Intake
            └ Application received  · simulator → handler · 12ms
14:23:08  Spreading
            ├ Spreader              · financial-spreader · 240ms
            ├ DSCR calculator       · dscr-calculator · 180ms
            ├ Covenant analyzer     · covenant-analyzer · 320ms
            └ Industry risk scorer  · industry-risk-scorer · 110ms
14:23:14  Policy
            ├ 16 rules evaluated   · rules-service · 480ms
            └ Eligibility passed   · rules-service · 12ms
14:23:18  Drafting
            ├ Document classifier  · agent · 4.2s · $0.012
            ├ Risk rater           · agent · 6.8s · $0.041   ⏵ "Pass — Tier 1, leverage"
            ├ Memo drafter         · agent ◐ running · 12K tokens in
            └ ...
```

The "agent" rows render as agent-activity tiles (per `agent-activity-ui`
skill).

**Implementation:** `usecases/credit-memo-commercial/ui/components/pipeline-activity.tsx`.
**Width budget:** 320 min, full width preferred.

### 4c. `<LiveStatusBadge>` — the system-up indicator

A small badge in the AppShell top bar that shows "Live · 11/11
services" (green dot), or "Stale" (amber), or "Down" (red, with
retry). Driven by the SSE channel's `ping` events + a service-health
manifest.

**Implementation:** `ui/apps/<console>/components/live-status.tsx`.
**Width budget:** inline in the top bar.

---

## Animation patterns ("come to life")

The motion communicates state change. Every event-spine UI uses these:

| Event | Motion |
|---|---|
| Stage chip transition (amber → green) | 200ms ease-out tint, no layout shift |
| New row arrives in queue | Fade in + slide down 8px, 300ms cubic, stagger 30ms |
| Event row expands | Height transition 200ms ease-out |
| Live status flips to "down" | Pulse once (red), then settle |
| Cost / latency totals update | Number tweens 400ms |

Canonical: `framer-motion` `<AnimatePresence>` for queue rows.
Token: `--t-mod` (180ms) and `--ease` (cubic-bezier(0.2,0,0,1))
from `ui-standards.md` §1.4.

---

## Drill-in pattern

Clicking any event row opens a side drawer (or full route for an
agent action) with:

- The event's full `payload` JSON (engineer view)
- Banker-readable summary (banker view; toggle in AppShell)
- Inputs (the request the service received) and outputs (the response)
- For agent actions, the reasoning trace (collapsible)
- Tools invoked (nested rows — recursive event drill-in)

This is implemented as `<EventDetailPanel>` (use-case scope, lives at
`usecases/<uc>/ui/components/event-detail-panel.tsx`).

---

## Anti-patterns to refuse

- **`setInterval(fetch, …)` on case-state queries** — use SSE. Rejected
  by ui-standards Rule 4.9.
- **Two SSE endpoints per console** — one stream, fan out per-case
  client-side. Two = duplicated infra + reconnect storms.
- **No heartbeat** — Cloud Run idle timeout will sever the stream.
- **No snapshot on connect** — the user sees a blank page until the
  first delta lands.
- **Server Component reads stale state** — every SSE delta MUST trigger
  `router.refresh()` (Rule 4.11). Without it, the page goes stale.
- **Hidden event panel** — if it's collapsed-by-default and never
  hinted at, the user will never expand it. The "watch the system
  work" experience must be visible by default.
- **Decorative-only animation** — motion must communicate state
  change, not just decorate. 600ms bounces are rejected.
- **Empty-state placeholder text "no data"** — purposeful empty state
  with illustration + CTA (Rule 4.8).

---

## CI gates

- **Rule 4.9** — `grep -rnE "setInterval.*fetch.*(/api/cases|/api/audit)"`
  rejects any new polling on case-state queries.
- **Rule 4.11** — `scripts/lint_ui_sse_invalidate.mjs` checks every
  `app/**/page.tsx` that imports `lib/live-data` either includes a
  Client subscriber that calls `router.refresh()` or has a comment
  justifying it as a one-shot snapshot.
- **`scripts/test_ui_smoke.mjs --check=event-spine`** opens the page
  in headless browser, verifies the SSE stream connects, sends a
  fake state-change event, asserts the UI updated within 500ms.

---

## Onboarding a new use case

For use case #2 onwards, here's the canonical scaffold:

1. **Schema** — confirm `infra/shared/schema.sql` has `application_state`
   and `application_events` (already there from credit-memo-commercial).
2. **Orchestrator** — every state transition writes to
   `application_state` and publishes `application_state_changed`. The
   credit-memo orchestrator at
   `services/orchestrator-credit-memo/main.py` is the canonical
   implementation.
3. **SSE endpoint** — copy
   `ui/apps/pipeline-console/app/api/live/stream/route.ts` and
   parameterize the table column names if your UC's state shape
   differs.
4. **Client hooks** — copy
   `usecases/credit-memo-commercial/ui/lib/live-stream.ts`
   (TBD: this lives in pipeline-console's lib/live-stream today; the
   per-UC hook lives in the UC's lib/live-data) and shape it to your
   row type.
5. **UI panels** — import `<LiveQueueTable>`, `<PipelineActivity>`,
   `<LiveStatusBadge>` from `@uc/components` (your UC's bundle) or
   from `@fsi-bank/components` once promoted (Rule of Three).

---

## Reference

- Canonical implementation:
  - Server SSE: `ui/apps/pipeline-console/app/api/live/stream/route.ts`
  - Client hook: `ui/apps/pipeline-console/lib/live-stream.ts`
  - Live queue table: `usecases/credit-memo-commercial/ui/components/live-queue-table.tsx`
  - Pipeline activity panel: `usecases/credit-memo-commercial/ui/components/pipeline-activity.tsx`
  - Live status badge: `ui/apps/pipeline-console/components/live-status.tsx`
- `docs/methodology/agentic-ui-principles.md` — Principle 1
- `docs/methodology/ui-standards.md` §4.9, §4.11 — the gates that enforce this pattern
- `docs/methodology/product-build-discipline.md` Rule 13 (live > polled > static)
