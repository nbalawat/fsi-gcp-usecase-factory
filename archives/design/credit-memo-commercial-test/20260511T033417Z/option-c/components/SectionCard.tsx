"use client";

import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { GateId, SectionDecision, SectionKind } from "../lib/data";
import { InlineActionBar } from "./InlineActionBar";

export interface SectionCardProps {
  caseId: string;
  id: SectionKind;
  title: string;
  prompt: string;
  source: string;
  gate: GateId;
  confidence?: number;
  tone?: "ok" | "warning" | "danger";
  /** Already-recorded decision; pending if not yet acted on. */
  decision: SectionDecision;
  onDecide: (next: SectionDecision) => void;
  /** Content rendered between the section header and the inline action bar. */
  children: React.ReactNode;
}

/**
 * Wrapper for one memo section. Always renders the inline action bar
 * directly under the body — no separate drawer, no sticky bar. The
 * user's eye never leaves the section to act.
 */
export const SectionCard: React.FC<SectionCardProps> = ({
  caseId,
  id,
  title,
  prompt,
  source,
  gate,
  confidence,
  tone,
  decision,
  onDecide,
  children,
}) => {
  return (
    <section
      id={`section-${id}`}
      aria-labelledby={`section-${id}-title`}
      data-section-id={id}
      data-decision={decision.kind}
      className="scroll-mt-20 rounded-lg border border-rule bg-paper p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <h2
            id={`section-${id}-title`}
            className="font-serif text-h3 font-semi text-ink-1"
          >
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-body-sm text-ink-2">{prompt}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind={toneBadge(tone)}>
            {toneLabel(tone)}
          </StatusBadge>
          {confidence !== undefined && (
            <span className="rounded-sm bg-paper-2 px-2 py-0.5 font-mono text-mono-sm text-ink-2">
              conf {Math.round(confidence * 100)}%
            </span>
          )}
          <span className="font-mono text-mono-sm text-ink-3">
            via {source}
          </span>
        </div>
      </header>

      <div className="border-t border-rule pt-4">{children}</div>

      <InlineActionBar
        caseId={caseId}
        sectionId={id}
        sectionTitle={title}
        gate={gate}
        decision={decision}
        onDecide={onDecide}
      />
    </section>
  );
};

const toneBadge = (
  t: "ok" | "warning" | "danger" | undefined,
): "success" | "warning" | "danger" | "neutral" => {
  if (t === "ok") return "success";
  if (t === "warning") return "warning";
  if (t === "danger") return "danger";
  return "neutral";
};

const toneLabel = (t: "ok" | "warning" | "danger" | undefined): string => {
  if (t === "ok") return "within band";
  if (t === "warning") return "watch";
  if (t === "danger") return "off band";
  return "informational";
};
