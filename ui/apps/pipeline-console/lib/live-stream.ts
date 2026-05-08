"use client";

/**
 * Browser-side SSE consumer hooks. Each hook opens a long-lived `EventSource`
 * to `/api/live/stream`, applies `snapshot` / `state_changed` events as React
 * state, and gracefully reconnects with exponential backoff on disconnect.
 *
 * Events emitted by the server:
 *   - `snapshot`        { cases: ApplicationState[] }
 *   - `state_changed`   { case: ApplicationState, recent_events: AuditEvent[] }
 *
 * Each hook deduplicates by stable id (application_id for cases, event id for
 * audit rows) so the same row never appears twice if the server retries.
 */

import * as React from "react";
import type {
  ApplicationState,
  AuditEvent,
  AuditTotals,
  MemoBody,
} from "@uc/lib/types";

type Status = "connecting" | "connected" | "error";

// ── Generic reconnecting EventSource ─────────────────────────────────────

type Handlers = Record<string, (data: unknown) => void>;

function useEventSource(
  url: string,
  handlers: Handlers,
  enabled = true,
): { status: Status } {
  const [status, setStatus] = React.useState<Status>("connecting");
  // Stable handler ref so reconnects don't tear down the listener.
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  React.useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined") return undefined;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      setStatus("connecting");
      es = new EventSource(url);

      es.onopen = () => {
        attempt = 0;
        setStatus("connected");
      };

      // Wire each named event individually. Generic `message` is unused.
      for (const name of Object.keys(handlersRef.current)) {
        es.addEventListener(name, (ev: MessageEvent) => {
          try {
            const data = JSON.parse(ev.data);
            handlersRef.current[name]?.(data);
          } catch {
            // malformed frame — drop
          }
        });
      }

      es.onerror = () => {
        setStatus("error");
        es?.close();
        es = null;
        attempt += 1;
        // Exponential backoff capped at 10s.
        const delay = Math.min(10_000, 500 * 2 ** Math.min(attempt, 5));
        reconnectTimer = setTimeout(open, delay);
      };
    };

    open();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled]);

  return { status };
}

// ── Hook 1: live queue (homepage) ────────────────────────────────────────

export interface UseLiveQueueResult {
  cases: ApplicationState[];
  status: Status;
}

export function useLiveQueue(): UseLiveQueueResult {
  const [cases, setCases] = React.useState<ApplicationState[]>([]);

  const handlers = React.useMemo<Handlers>(
    () => ({
      snapshot: (data) => {
        const d = data as { cases?: ApplicationState[] };
        if (Array.isArray(d.cases)) setCases(d.cases);
      },
      state_changed: (data) => {
        const d = data as { case?: ApplicationState };
        if (!d.case) return;
        setCases((prev) => {
          const idx = prev.findIndex(
            (c) => c.application_id === d.case!.application_id,
          );
          if (idx === -1) return [d.case!, ...prev];
          const next = prev.slice();
          next[idx] = d.case!;
          return next;
        });
      },
    }),
    [],
  );

  const { status } = useEventSource("/api/live/stream", handlers);
  return { cases, status };
}

// ── Hook 2: single case + recent events + memo ────────────────────────────

export interface UseLiveCaseResult {
  case: ApplicationState | null;
  events: AuditEvent[];
  memo: MemoBody | null;
  status: Status;
}

export function useLiveCase(applicationId: string): UseLiveCaseResult {
  const [c, setCase] = React.useState<ApplicationState | null>(null);
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [memo, setMemo] = React.useState<MemoBody | null>(null);

  // Hydrate via REST on mount; SSE then keeps it fresh.
  React.useEffect(() => {
    if (!applicationId) return;
    let abort = false;
    fetch(`/api/cases/${encodeURIComponent(applicationId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (abort || !d) return;
        if (d.case) setCase(d.case);
        if (Array.isArray(d.events)) setEvents(d.events);
        if (d.memo !== undefined) setMemo(d.memo ?? null);
      })
      .catch(() => {
        // surfaced via status from the SSE connection
      });
    return () => {
      abort = true;
    };
  }, [applicationId]);

  const handlers = React.useMemo<Handlers>(
    () => ({
      state_changed: (data) => {
        const d = data as { case?: ApplicationState; recent_events?: AuditEvent[] };
        if (!d.case || d.case.application_id !== applicationId) return;
        setCase(d.case);
        if (Array.isArray(d.recent_events) && d.recent_events.length > 0) {
          setEvents((prev) => mergeEvents(prev, d.recent_events!));
        }
      },
    }),
    [applicationId],
  );

  const { status } = useEventSource("/api/live/stream", handlers, !!applicationId);
  return { case: c, events, memo, status };
}

// ── Hook 3: full audit trail with running totals ─────────────────────────

export interface UseLiveAuditTrailResult {
  events: AuditEvent[];
  totals: AuditTotals;
  status: Status;
}

const EMPTY_TOTALS: AuditTotals = {
  latencyMs: 0,
  costUsd: 0,
  agentCount: 0,
  ruleCount: 0,
  serviceCount: 0,
};

export function useLiveAuditTrail(applicationId: string): UseLiveAuditTrailResult {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [totals, setTotals] = React.useState<AuditTotals>(EMPTY_TOTALS);

  React.useEffect(() => {
    if (!applicationId) return;
    let abort = false;
    fetch(`/api/audit/${encodeURIComponent(applicationId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (abort || !d) return;
        if (Array.isArray(d.events)) setEvents(d.events);
        if (d.totals) setTotals(d.totals);
      })
      .catch(() => undefined);
    return () => {
      abort = true;
    };
  }, [applicationId]);

  const handlers = React.useMemo<Handlers>(
    () => ({
      state_changed: (data) => {
        const d = data as { case?: ApplicationState; recent_events?: AuditEvent[] };
        if (!d.case || d.case.application_id !== applicationId) return;
        if (Array.isArray(d.recent_events) && d.recent_events.length > 0) {
          setEvents((prev) => {
            const merged = mergeEvents(prev, d.recent_events!);
            // Recompute totals from the merged set so they stay in sync.
            setTotals(rollup(merged));
            return merged;
          });
        }
      },
    }),
    [applicationId],
  );

  const { status } = useEventSource("/api/live/stream", handlers, !!applicationId);
  return { events, totals, status };
}

// ── helpers ───────────────────────────────────────────────────────────────

function mergeEvents(prev: AuditEvent[], incoming: AuditEvent[]): AuditEvent[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((e) => e.id));
  const merged = prev.slice();
  for (const e of incoming) {
    if (!seen.has(e.id)) {
      merged.push(e);
      seen.add(e.id);
    }
  }
  // Keep oldest → newest.
  merged.sort((a, b) => {
    const ta = new Date(a.occurred_at).getTime();
    const tb = new Date(b.occurred_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });
  return merged;
}

function rollup(events: AuditEvent[]): AuditTotals {
  let latencyMs = 0;
  let costUsd = 0;
  let agentCount = 0;
  let ruleCount = 0;
  let serviceCount = 0;
  for (const e of events) {
    if (typeof e.latency_ms === "number") latencyMs += e.latency_ms;
    if (typeof e.cost_usd === "number") costUsd += e.cost_usd;
    if (e.event_type === "agent_action") agentCount += 1;
    else if (e.event_type === "rule_evaluated") ruleCount += 1;
    else if (e.event_type === "service_invoked") serviceCount += 1;
  }
  return { latencyMs, costUsd, agentCount, ruleCount, serviceCount };
}
