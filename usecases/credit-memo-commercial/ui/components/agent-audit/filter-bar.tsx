"use client";

import * as React from "react";
import { Search, ArrowDownUp } from "lucide-react";
import { cn } from "@/lib/ui";

export type AuditFilterKind =
  | "all"
  | "agent_action"
  | "service_invoked"
  | "rule_evaluated"
  | "stage_entered";

export type AuditSort =
  | "oldest"
  | "newest"
  | "latency_desc"
  | "cost_desc";

export interface AuditFilters {
  kind: AuditFilterKind;
  agents: string[];
  sort: AuditSort;
  search: string;
}

export const DEFAULT_FILTERS: AuditFilters = {
  kind: "all",
  agents: [],
  sort: "oldest",
  search: "",
};

interface FilterBarProps {
  filters: AuditFilters;
  onChange: (next: AuditFilters) => void;
  /** All known agent roles in this trail; used for the multi-select chip set. */
  agentRoles: { id: string; label: string; count: number }[];
  /** Total visible after filtering. Renders as a count next to the filter chips. */
  visibleCount: number;
  totalCount: number;
}

const kindOptions: { id: AuditFilterKind; label: string }[] = [
  { id: "all", label: "All events" },
  { id: "agent_action", label: "Agent actions" },
  { id: "service_invoked", label: "Service calls" },
  { id: "rule_evaluated", label: "Rules" },
  { id: "stage_entered", label: "Stages" },
];

const sortOptions: { id: AuditSort; label: string }[] = [
  { id: "oldest", label: "Oldest first" },
  { id: "newest", label: "Newest first" },
  { id: "latency_desc", label: "Slowest first" },
  { id: "cost_desc", label: "Most expensive first" },
];

/**
 * Filter bar for the audit trail. All controls are real form elements
 * (no styled divs) so they're keyboard-friendly and the smoke test passes.
 */
export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChange,
  agentRoles,
  visibleCount,
  totalCount,
}) => {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-rule bg-paper p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-8 items-center gap-2 rounded-sm border border-rule bg-paper-2 px-2.5 text-mono-sm font-mono text-ink-3 focus-within:border-accent focus-within:bg-paper">
          <Search aria-hidden className="h-3.5 w-3.5" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) =>
              onChange({ ...filters, search: e.currentTarget.value })
            }
            placeholder="Search reasoning + summaries"
            aria-label="Search audit events"
            className="w-72 bg-transparent text-ink-1 placeholder:text-ink-3 focus:outline-none"
          />
        </label>
        <div className="ml-auto flex items-center gap-2 text-mono-sm font-mono text-ink-3">
          <span>
            {visibleCount} / {totalCount} events
          </span>
          <label className="ml-2 flex h-8 items-center gap-1.5 rounded-sm border border-rule bg-paper-2 px-2 text-ink-2 focus-within:border-accent">
            <ArrowDownUp aria-hidden className="h-3 w-3" />
            <span className="sr-only">Sort by</span>
            <select
              value={filters.sort}
              onChange={(e) =>
                onChange({ ...filters, sort: e.currentTarget.value as AuditSort })
              }
              aria-label="Sort events"
              className="bg-transparent text-ink-1 focus:outline-none"
            >
              {sortOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {kindOptions.map((k) => {
          const active = filters.kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Filter by ${k.label}`}
              onClick={() => onChange({ ...filters, kind: k.id })}
              className={cn(
                "rounded-md border px-2.5 py-1 text-mono-sm font-mono",
                active
                  ? "border-accent-pressed bg-accent-tint text-accent-pressed"
                  : "border-rule bg-paper-2 text-ink-2 hover:bg-paper",
              )}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      {agentRoles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
            Agent
          </span>
          {agentRoles.map((a) => {
            const active = filters.agents.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={active}
                aria-label={`Toggle agent ${a.label}`}
                onClick={() =>
                  onChange({
                    ...filters,
                    agents: active
                      ? filters.agents.filter((x) => x !== a.id)
                      : [...filters.agents, a.id],
                  })
                }
                className={cn(
                  "rounded-md border px-2 py-0.5 text-mono-sm font-mono",
                  active
                    ? "border-accent-pressed bg-accent-tint text-accent-pressed"
                    : "border-rule bg-paper-2 text-ink-2 hover:bg-paper",
                )}
              >
                {a.label}
                <span className="ml-1.5 text-ink-3">{a.count}</span>
              </button>
            );
          })}
          {filters.agents.length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, agents: [] })}
              aria-label="Clear agent filters"
              className="ml-1 text-mono-sm font-mono text-ink-3 hover:text-ink-1"
            >
              clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};
