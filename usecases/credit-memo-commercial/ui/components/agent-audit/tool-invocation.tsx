"use client";

import * as React from "react";
import { Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtLatency } from "../../lib/audit-format";

export interface ToolInvocation {
  name: string;
  url?: string;
  latency_ms?: number;
  input_hash?: string;
  output_hash?: string;
}

interface ToolInvocationListProps {
  tools: ToolInvocation[];
  variant?: "banker" | "engineer";
}

/**
 * Compact chip list of atomic services / rules an agent invoked while
 * producing its output. Engineer view exposes the tool URL + i/o hashes so
 * an investigator can replay or diff.
 */
export const ToolInvocationList: React.FC<ToolInvocationListProps> = ({
  tools,
  variant = "banker",
}) => {
  if (!tools || tools.length === 0) {
    return (
      <p className="text-body-sm italic text-ink-3">
        No tools invoked — the agent answered from context alone.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {tools.map((t, i) => (
        <li key={`${t.name}-${i}`}>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-paper-2 px-2 py-1 font-mono text-mono-sm text-ink-2">
            <Wrench aria-hidden className="h-3 w-3 text-ink-3" />
            {t.name}
            {typeof t.latency_ms === "number" && (
              <Badge tone="neutral" className="ml-1 px-1 py-0 text-[10px]">
                {fmtLatency(t.latency_ms)}
              </Badge>
            )}
          </span>
          {variant === "engineer" && (
            <span className="ml-2 font-mono text-[11px] text-ink-3">
              {t.input_hash && `in ${t.input_hash}`}
              {t.input_hash && t.output_hash ? " · " : ""}
              {t.output_hash && `out ${t.output_hash}`}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
};
