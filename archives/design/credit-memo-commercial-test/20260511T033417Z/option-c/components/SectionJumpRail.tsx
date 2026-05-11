"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type {
  GateId,
  MemoSection,
  SectionDecision,
  SectionKind,
} from "../lib/data";

interface SectionJumpRailProps {
  sections: MemoSection[];
  decisions: Record<SectionKind, SectionDecision>;
  gates: GateId[];
}

/**
 * A short, sticky in-page rail that lists every section and the
 * status of its inline decision. Click → jump to the section. NOT a
 * separate review surface: it's a table of contents that also
 * reflects per-section disposition so the analyst can scan progress
 * without scrolling.
 */
export const SectionJumpRail: React.FC<SectionJumpRailProps> = ({
  sections,
  decisions,
  gates,
}) => {
  const grouped = gates.map((g) => ({
    gate: g,
    rows: sections.filter((s) => s.gate === g),
  }));

  return (
    <nav
      aria-label="Memo sections"
      className="sticky top-4 flex flex-col gap-4 rounded-md border border-rule bg-paper p-3 text-mono-sm"
    >
      <div className="font-mono uppercase tracking-wide text-ink-3">
        Sections · per-gate
      </div>
      {grouped.map(({ gate, rows }) => (
        <div key={gate} className="flex flex-col gap-1">
          <div className="font-mono text-mono-sm text-ink-3">
            {gate.replace(/_/g, " ")}
          </div>
          <ul className="flex flex-col gap-1">
            {rows.map((s) => {
              const d = decisions[s.id]?.kind ?? "pending";
              return (
                <li key={s.id}>
                  <a
                    href={`#section-${s.id}`}
                    className="flex items-center justify-between rounded px-2 py-1 text-ink-1 hover:bg-paper-2"
                  >
                    <span className="truncate">{s.title}</span>
                    <StatusBadge kind={kindToBadge(d)}>
                      {shortLabel(d)}
                    </StatusBadge>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
};

const kindToBadge = (
  k: SectionDecision["kind"],
): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (k === "approve") return "success";
  if (k === "edit") return "info";
  if (k === "request-revision") return "warning";
  if (k === "reject") return "danger";
  return "neutral";
};

const shortLabel = (k: SectionDecision["kind"]): string => {
  if (k === "approve") return "ok";
  if (k === "edit") return "edited";
  if (k === "request-revision") return "rev";
  if (k === "reject") return "no";
  return "pending";
};
