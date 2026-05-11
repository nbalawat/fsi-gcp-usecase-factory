"use client";

import * as React from "react";
import { ActorFilterBar } from "./ActorFilterBar";
import { TranscriptRow } from "./TranscriptRow";
import {
  filterTranscript,
  toTranscript,
  type TranscriptFilter,
  type TranscriptRow as TranscriptRowData,
} from "../lib/data";

interface RawEvt {
  at: string;
  kind: string;
  stage?: string;
  doc_type?: string;
  service?: string;
  agent?: string;
  gate?: string;
  decision?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  confidence?: number;
}

export interface CaseTranscriptProps {
  events: readonly RawEvt[];
  /** Where the "Respond →" link on a pending gate row should go */
  approvalHref: string;
}

/**
 * The wildcard's signature: the case as a chat-style transcript. Every
 * agent action, every service call, every human gate is a row. The
 * filter bar at the top lets the reader scrub by actor.
 *
 * Client component because the filter is interactive. Data shaping
 * (event → row) is pure and deterministic from the event log.
 */
export const CaseTranscript: React.FC<CaseTranscriptProps> = ({
  events,
  approvalHref,
}) => {
  const allRows: TranscriptRowData[] = React.useMemo(
    () => toTranscript(events),
    [events],
  );

  const counts = React.useMemo(() => {
    const c: Partial<Record<TranscriptFilter, number>> = { all: allRows.length };
    for (const r of allRows) c[r.actor] = (c[r.actor] ?? 0) + 1;
    return c;
  }, [allRows]);

  const [filter, setFilter] = React.useState<TranscriptFilter>("all");
  const rows = React.useMemo(
    () => filterTranscript(allRows, filter),
    [allRows, filter],
  );

  return (
    <section
      aria-label="Case transcript"
      className="rounded-md border border-rule bg-paper"
    >
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <div>
          <div className="eyebrow">Conversation timeline</div>
          <h2 className="font-serif text-h3 font-semi text-ink-1">
            Case transcript
          </h2>
        </div>
        <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
          {rows.length} of {allRows.length} entries
        </span>
      </header>
      <ActorFilterBar
        active={filter}
        counts={counts}
        onChange={setFilter}
      />
      <ol className="flex flex-col">
        {rows.map((r) => (
          <TranscriptRow
            key={r.idx}
            row={r}
            approvalHref={r.actor === "gate" ? approvalHref : undefined}
          />
        ))}
      </ol>
    </section>
  );
};
