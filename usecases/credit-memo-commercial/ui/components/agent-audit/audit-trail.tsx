"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AuditEvent, AuditTotals } from "../../lib/types";
import { roleLabel } from "../../lib/audit-format";
import { useLiveAuditTrail } from "@/lib/live-stream";
import { MOCK_EVENTS, MOCK_TOTALS } from "../../lib/audit-fixtures";
import { AgentActionRow } from "./agent-action-row";
import { AuditTotalsBar } from "./audit-totals";
import {
  FilterBar,
  DEFAULT_FILTERS,
  type AuditFilters,
} from "./filter-bar";
import { AuditExport } from "./audit-export";
import {
  ViewModeToggle,
  useViewMode,
} from "./view-mode-toggle";

interface AuditTrailProps {
  applicationId: string;
  /** When true, surface the borrower line in the panel header. Defaults to false. */
  borrowerName?: string;
  /** When true, the totals bar is rendered above the rows. Default true. */
  showTotals?: boolean;
  /** When true, show the heavy/full layout (full-page route). */
  layout?: "panel" | "page";
}

/**
 * The agent audit trail — a chronological transparency feed of every event
 * the AI underwriter has generated for one application. Live-updates from
 * the SSE stream; supports banker / engineer view modes; exports JSON + CSV.
 *
 * Data layer ownership: the `useLiveAuditTrail` hook in `lib/live-stream.ts`
 * is built and maintained by the data-track agent. This component is a pure
 * consumer; mock data only loads in dev when `?mock=1` is set.
 */
export const AuditTrail: React.FC<AuditTrailProps> = ({
  applicationId,
  borrowerName,
  showTotals = true,
  layout = "panel",
}) => {
  const live = useLiveAuditTrail(applicationId);
  const mock = useMockMode();

  // Snapshot which event IDs we've already rendered so a freshly-arrived row
  // gets a one-time slide-in animation. Refs (not state) — we don't need to
  // re-render when the seen set changes.
  const seenIdsRef = React.useRef<Set<number>>(new Set());
  const events: AuditEvent[] = mock ? MOCK_EVENTS : live.events;
  const totals: AuditTotals = mock ? MOCK_TOTALS : live.totals;
  const status = mock ? "connected" : live.status;

  const [viewMode, setViewMode] = useViewMode();
  const [filters, setFilters] = React.useState<AuditFilters>(DEFAULT_FILTERS);

  // ── compute the visible rows + the agent-role facet ────────────────────
  const { visible, agentRoles } = React.useMemo(
    () => filterAndSort(events, filters),
    [events, filters],
  );

  // Mark first render's events as already seen so we don't animate the
  // initial hydrate — only genuinely new rows should slide in.
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    if (!hydrated && events.length > 0) {
      events.forEach((e) => seenIdsRef.current.add(e.id));
      setHydrated(true);
    }
  }, [events, hydrated]);

  const isLoading = !mock && status === "connecting" && events.length === 0;
  const isErrored =
    !mock && status === "error" && events.length === 0;
  const isEmpty = !isLoading && !isErrored && events.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── header ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
            Agent audit trail{mock ? " · mock data" : ""}
          </p>
          <h2
            className={
              layout === "page"
                ? "mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1"
                : "mt-1 font-serif text-h2 font-semi tracking-tight text-ink-1"
            }
          >
            {borrowerName ?? "Live agent activity"}
          </h2>
          <p className="mt-1 text-body-sm text-ink-3">
            Every step the AI took on this application, in order. Click any
            row to see what it considered, what it found, and what it cited.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <AuditExport applicationId={applicationId} />
        </div>
      </div>

      {showTotals && (
        <AuditTotalsBar
          totals={totals}
          trailing={
            <Badge tone={status === "connected" ? "success" : "warning"} dot>
              {status === "connected"
                ? "Live"
                : status === "connecting"
                  ? "Connecting"
                  : "Reconnecting"}
            </Badge>
          }
        />
      )}

      <FilterBar
        filters={filters}
        onChange={setFilters}
        agentRoles={agentRoles}
        visibleCount={visible.length}
        totalCount={events.length}
      />

      {/* ── body ──────────────────────────────────────────── */}
      {isLoading && <LoadingSkeleton />}
      {isErrored && <ErrorState />}
      {isEmpty && <EmptyState />}

      {!isLoading && !isErrored && visible.length === 0 && events.length > 0 && (
        <div className="rounded-lg border border-rule bg-paper p-6 text-center text-body-sm text-ink-3">
          No events match these filters. Clear them to see everything.
        </div>
      )}

      {visible.length > 0 && (
        <ol className="flex flex-col gap-3">
          {visible.map((event, i) => {
            const isFresh =
              hydrated && !seenIdsRef.current.has(event.id);
            if (isFresh) seenIdsRef.current.add(event.id);
            return (
              <AgentActionRow
                key={event.id}
                event={event}
                viewMode={viewMode}
                index={i}
                fresh={isFresh}
              />
            );
          })}
        </ol>
      )}
    </div>
  );
};

// ── filter / sort helpers ──────────────────────────────────────────────

function filterAndSort(
  events: AuditEvent[],
  filters: AuditFilters,
): {
  visible: AuditEvent[];
  agentRoles: { id: string; label: string; count: number }[];
} {
  // First — count agent roles across the unfiltered set so the chip facet is stable.
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.event_type !== "agent_action") continue;
    const role = (e.payload as Record<string, unknown>)?.agent_role;
    if (typeof role !== "string") continue;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  const agentRoles = Array.from(counts.entries())
    .map(([id, count]) => ({ id, label: roleLabel(id), count }))
    .sort((a, b) => b.count - a.count);

  let out = events.slice();

  if (filters.kind !== "all") {
    out = out.filter((e) =>
      filters.kind === "rule_evaluated"
        ? e.event_type === "rule_evaluated" || e.event_type === "rule_skipped"
        : e.event_type === filters.kind,
    );
  }

  if (filters.agents.length > 0) {
    out = out.filter((e) => {
      if (e.event_type !== "agent_action") return false;
      const role = (e.payload as Record<string, unknown>)?.agent_role;
      return typeof role === "string" && filters.agents.includes(role);
    });
  }

  if (filters.search.trim()) {
    const needle = filters.search.trim().toLowerCase();
    out = out.filter((e) => {
      const p = e.payload as Record<string, unknown>;
      const summary = typeof p.output_summary === "string" ? p.output_summary : "";
      const trace = typeof p.reasoning_trace === "string" ? p.reasoning_trace : "";
      const inputs = typeof p.inputs_summary === "string" ? p.inputs_summary : "";
      return (
        summary.toLowerCase().includes(needle) ||
        trace.toLowerCase().includes(needle) ||
        inputs.toLowerCase().includes(needle) ||
        (e.service_name ?? "").toLowerCase().includes(needle)
      );
    });
  }

  switch (filters.sort) {
    case "newest":
      out.sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      );
      break;
    case "latency_desc":
      out.sort((a, b) => (b.latency_ms ?? 0) - (a.latency_ms ?? 0));
      break;
    case "cost_desc":
      out.sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0));
      break;
    case "oldest":
    default:
      out.sort(
        (a, b) =>
          new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
      );
      break;
  }

  return { visible: out, agentRoles };
}

// ── states ─────────────────────────────────────────────────────────────

const LoadingSkeleton: React.FC = () => (
  <ol className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
    {Array.from({ length: 5 }).map((_, i) => (
      <li
        key={i}
        className="flex items-start gap-3 rounded-md border border-rule bg-paper p-4"
      >
        <span className="mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-paper-3" />
        <div className="flex-1">
          <div className="h-3 w-40 rounded bg-paper-3" />
          <div className="mt-2 h-3 w-3/4 rounded bg-paper-3" />
          <div className="mt-1.5 h-3 w-1/2 rounded bg-paper-3" />
        </div>
      </li>
    ))}
  </ol>
);

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-rule bg-paper-2 p-10 text-center">
    <p className="font-serif text-h3 font-semi text-ink-1">
      No agent actions yet — waiting for the pipeline to start.
    </p>
    <p className="max-w-md text-body-sm text-ink-3">
      As the AI underwriter processes this application, every step shows up
      here. Each row will show what the specialist considered, what it found,
      and the documents it cited.
    </p>
  </div>
);

const ErrorState: React.FC = () => {
  const onReload = React.useCallback(() => {
    if (typeof window !== "undefined") window.location.reload();
  }, []);
  return (
    <div className="flex items-start gap-3 rounded-md border border-semantic-danger/30 bg-semantic-dangerTint/30 p-4">
      <AlertTriangle
        aria-hidden
        className="mt-0.5 h-5 w-5 flex-shrink-0 text-semantic-danger"
      />
      <div className="flex-1">
        <p className="text-body-sm font-semi text-ink-1">
          Couldn&apos;t connect to the live audit stream.
        </p>
        <p className="mt-1 text-body-sm text-ink-2">
          The page will keep retrying in the background. If this persists,
          reload to start a fresh session.
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onReload}
        aria-label="Reload page"
      >
        <RefreshCw className="h-3 w-3" />
        Reload
      </Button>
    </div>
  );
};

// ── mock-mode detection ────────────────────────────────────────────────

function useMockMode(): boolean {
  const [mock, setMock] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "development") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mock") === "1") setMock(true);
  }, []);
  return mock;
}
