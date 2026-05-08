"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui";

interface ReasoningPanelProps {
  /** The full reasoning text. First paragraph is shown by default. */
  trace: string;
  /** Banker mode shows a soft summary; engineer mode shows the raw text. */
  variant?: "banker" | "engineer";
}

/**
 * Renders the agent's "what I did" reasoning trace. The first paragraph is
 * always visible; the rest is hidden behind a "View full reasoning" toggle so
 * the row stays compact by default.
 */
export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({ trace, variant = "banker" }) => {
  const [expanded, setExpanded] = React.useState(false);
  const paragraphs = (trace ?? "").trim().split(/\n\n+/);
  const head = paragraphs[0] ?? "";
  const tail = paragraphs.slice(1);

  if (!trace) {
    return (
      <p className="text-body-sm italic text-ink-3">
        No reasoning trace recorded for this action.
      </p>
    );
  }

  return (
    <div
      className={cn(
        variant === "engineer"
          ? "rounded-md border border-rule bg-paper-2 p-3"
          : "",
      )}
    >
      <p
        className={cn(
          "whitespace-pre-wrap",
          variant === "engineer"
            ? "font-mono text-mono-sm text-ink-2"
            : "text-body-sm text-ink-1",
        )}
      >
        {head}
      </p>
      {tail.length > 0 && (
        <>
          <div
            className={cn(
              "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
              expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="min-h-0">
              <div className="mt-2 flex flex-col gap-2">
                {tail.map((p, i) => (
                  <p
                    key={i}
                    className={cn(
                      "whitespace-pre-wrap",
                      variant === "engineer"
                        ? "font-mono text-mono-sm text-ink-2"
                        : "text-body-sm text-ink-1",
                    )}
                  >
                    {p}
                  </p>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="mt-2 inline-flex items-center gap-1 text-mono-sm font-mono text-accent-pressed hover:underline"
          >
            <ChevronDown
              aria-hidden
              className={cn(
                "h-3 w-3 transition-transform",
                expanded ? "rotate-180" : "",
              )}
            />
            {expanded ? "Hide full reasoning" : "View full reasoning"}
          </button>
        </>
      )}
    </div>
  );
};
