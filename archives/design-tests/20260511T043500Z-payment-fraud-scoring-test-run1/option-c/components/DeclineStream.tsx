"use client";

import * as React from "react";
import { DeclineFilterBar } from "./DeclineFilterBar";
import { DeclineStreamRow } from "./DeclineStreamRow";
import {
  filterDeclines,
  type DeclineFilter,
  type DeclineReason,
  type DeclineRow,
  type TuneActionKind,
} from "../lib/data";

export interface DeclineStreamProps {
  rows: readonly DeclineRow[];
}

interface ActionRecord {
  rowId: string;
  reasonId: string;
  kind: TuneActionKind;
  at: string;
}

/**
 * The bulk-tuning surface for option C. Renders the decline feed; each
 * row carries its own inline `DeclineReasonActions`. A small local action
 * log at the top shows the analyst the tunes they have queued — every
 * click is an audit-row-in-the-making.
 *
 * Client component because action state and the filter are interactive.
 * No mutations are sent anywhere; this is a designed-for-review mock.
 */
export const DeclineStream: React.FC<DeclineStreamProps> = ({ rows }) => {
  const [filter, setFilter] = React.useState<DeclineFilter>("all");
  // disposed = rowId -> reasonId -> action kind
  const [disposed, setDisposed] = React.useState<
    Record<string, Partial<Record<string, TuneActionKind>>>
  >({});
  const [log, setLog] = React.useState<ActionRecord[]>([]);

  const counts: Partial<Record<DeclineFilter, number>> = React.useMemo(() => {
    const c: Partial<Record<DeclineFilter, number>> = { all: rows.length };
    let d = 0;
    let s = 0;
    let h = 0;
    for (const r of rows) {
      if (r.disposition === "decline") d += 1;
      if (r.disposition === "step-up") s += 1;
      if (r.score >= 0.8) h += 1;
    }
    c.decline = d;
    c["step-up"] = s;
    c["high-score"] = h;
    return c;
  }, [rows]);

  const filtered = React.useMemo(
    () => filterDeclines(rows, filter),
    [rows, filter],
  );

  const handleAction = React.useCallback(
    (reason: DeclineReason, kind: TuneActionKind, rowId: string) => {
      setDisposed((prev) => ({
        ...prev,
        [rowId]: { ...(prev[rowId] ?? {}), [reason.id]: kind },
      }));
      setLog((prev) => [
        {
          rowId,
          reasonId: reason.id,
          kind,
          at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 20));
    },
    [],
  );

  return (
    <section
      aria-label="Decline-stream tuning surface"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-ink-3">
            Decline stream
          </div>
          <h2 className="font-serif text-xl font-semibold text-ink-1">
            Tune the model from the decline feed
          </h2>
        </div>
        <span className="font-mono text-mono-sm tabular-nums text-ink-3">
          {filtered.length} of {rows.length} declines
        </span>
      </header>
      <DeclineFilterBar
        active={filter}
        counts={counts}
        onChange={setFilter}
      />
      <ActionLog log={log} />
      <ol className="flex flex-col">
        {filtered.map((row) => (
          <DeclineStreamRow
            key={row.id}
            row={row}
            disposed={disposed[row.id] ?? {}}
            onAction={handleAction}
            detailHref={`/case/${row.id}`}
          />
        ))}
      </ol>
    </section>
  );
};

const KIND_LABEL: Record<TuneActionKind, string> = {
  override_for_customer: "Override (customer)",
  add_to_allowlist: "Allowlist (merchant)",
  tune_threshold: "Threshold tune",
  step_up_for_review: "Step-up",
};

interface ActionLogProps {
  log: ActionRecord[];
}

const ActionLog: React.FC<ActionLogProps> = ({ log }) => {
  if (log.length === 0) {
    return (
      <div className="border-b border-rule bg-paper-2 px-4 py-2 font-mono text-mono-sm text-ink-3">
        Action log — empty. Click an inline button below to queue a tune.
      </div>
    );
  }
  return (
    <div className="border-b border-rule bg-paper-2 px-4 py-2">
      <div className="text-xs font-medium uppercase tracking-wider text-ink-3 mb-1">
        Action log ({log.length})
      </div>
      <ol className="flex flex-col gap-1">
        {log.map((e, i) => (
          <li
            key={`${e.rowId}-${e.reasonId}-${i}`}
            className="flex flex-wrap items-baseline gap-2 font-mono text-mono-sm text-ink-2"
          >
            <span className="tabular-nums text-ink-3">
              {e.at.substring(11, 19)}
            </span>
            <span className="text-ink-1">{KIND_LABEL[e.kind]}</span>
            <span className="text-ink-3">
              on {e.reasonId} · {e.rowId}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};
