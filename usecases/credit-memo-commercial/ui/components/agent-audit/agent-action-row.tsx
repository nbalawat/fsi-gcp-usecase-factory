"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui";
import type { AuditEvent } from "../../lib/types";
import {
  eventStatus,
  eventTitle,
  fmtCost,
  fmtLatency,
  fmtTime,
  roleLabel,
} from "../../lib/audit-format";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ReasoningPanel } from "./reasoning-panel";
import { ToolInvocationList, type ToolInvocation } from "./tool-invocation";
import { CitationList, type Citation } from "./citation-list";
import { ReplayButton } from "./replay-button";
import type { ViewMode } from "./view-mode-toggle";

interface AgentActionRowProps {
  event: AuditEvent;
  viewMode: ViewMode;
  /** Index in the visible list — used as a "step number" prefix. */
  index: number;
  /** Whether this row is brand-new (rendered slide-in animation). */
  fresh?: boolean;
}

/**
 * One row per audit event. Collapsed by default; expand to see reasoning,
 * tools, citations, and (in engineer mode) the full prompt + completion.
 * Keyboard: Enter toggles the row, ArrowUp / ArrowDown move focus.
 */
export const AgentActionRow: React.FC<AgentActionRowProps> = ({
  event,
  viewMode,
  index,
  fresh,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const status = eventStatus(event);
  const title = eventTitle(event);
  const payload = event.payload as Record<string, unknown>;
  const isAgent = event.event_type === "agent_action";

  // Agent-specific fields (typed loosely — we narrow before reading).
  const agentRole = typeof payload.agent_role === "string" ? payload.agent_role : null;
  const inputsSummary =
    typeof payload.inputs_summary === "string" ? payload.inputs_summary : null;
  const outputSummary =
    typeof payload.output_summary === "string"
      ? payload.output_summary
      : typeof payload.reason === "string"
        ? (payload.reason as string)
        : null;
  const reasoningTrace =
    typeof payload.reasoning_trace === "string" ? payload.reasoning_trace : "";
  const tools = Array.isArray(payload.tools_invoked)
    ? (payload.tools_invoked as ToolInvocation[])
    : [];
  const citations = Array.isArray(payload.citations)
    ? (payload.citations as Citation[])
    : [];
  const outputFull =
    typeof payload.output_full === "object" && payload.output_full !== null
      ? (payload.output_full as Record<string, unknown>)
      : null;
  const synthesized = payload.synthesized === true;
  const tokens =
    typeof payload.tokens === "object" && payload.tokens !== null
      ? (payload.tokens as { input?: number; output?: number; thinking?: number })
      : null;
  const model = typeof payload.model === "string" ? payload.model : null;
  const modelParams =
    typeof payload.model_params === "object" && payload.model_params !== null
      ? (payload.model_params as Record<string, unknown>)
      : null;
  const confidence =
    typeof payload.confidence === "number" ? (payload.confidence as number) : null;

  // ── derived display props ──────────────────────────────────────────────
  const dotClass =
    status === "running"
      ? "bg-accent animate-pulse"
      : status === "skipped"
        ? "bg-semantic-warning"
        : status === "error"
          ? "bg-semantic-danger"
          : "bg-semantic-success";

  const kindBadge =
    event.event_type === "agent_action"
      ? "Agent"
      : event.event_type === "service_invoked"
        ? "Service"
        : event.event_type === "rule_evaluated"
          ? "Rule"
          : event.event_type === "rule_skipped"
            ? "Rule"
            : event.event_type === "stage_entered"
              ? "Stage"
              : event.event_type === "decision_made"
                ? "Decision"
                : event.event_type === "sink_completed"
                  ? "Sink"
                  : "Event";

  const role = isAgent ? roleLabel(agentRole) : title;

  return (
    <li
      data-fresh={fresh ? "1" : "0"}
      className={cn(
        "group rounded-md border border-rule bg-paper transition-all",
        fresh && "animate-[fadeSlideIn_220ms_ease-out]",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={`Toggle details for ${role}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = (e.currentTarget.parentElement?.nextElementSibling
              ?.firstElementChild as HTMLButtonElement | null) ?? null;
            next?.focus();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const prev = (e.currentTarget.parentElement?.previousElementSibling
              ?.firstElementChild as HTMLButtonElement | null) ?? null;
            prev?.focus();
          }
        }}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-paper-2 focus-visible:bg-paper-2"
      >
        <span
          aria-hidden
          className="mt-2 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center"
        >
          <span className={cn("h-2.5 w-2.5 rounded-full", dotClass)} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-mono-sm uppercase tracking-[0.04em] text-ink-3">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className={cn(
                "font-mono text-mono-sm",
                isAgent ? "text-ink-1" : "text-ink-2",
              )}
            >
              {role}
            </span>
            <Badge tone="outline" className="text-[10px]">
              {kindBadge}
            </Badge>
            {synthesized && (
              <Badge tone="warning" className="text-[10px]">
                stubbed
              </Badge>
            )}
            <span className="ml-auto flex items-center gap-2 font-mono text-mono-sm text-ink-3">
              {typeof event.latency_ms === "number" && (
                <span className="rounded-sm bg-paper-2 px-1.5 py-0.5">
                  {fmtLatency(event.latency_ms)}
                </span>
              )}
              {typeof event.cost_usd === "number" && event.cost_usd > 0 && (
                <span className="rounded-sm bg-paper-2 px-1.5 py-0.5">
                  {fmtCost(event.cost_usd)}
                </span>
              )}
              <span>{fmtTime(event.occurred_at)}</span>
              <ChevronRight
                aria-hidden
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  expanded ? "rotate-90" : "",
                )}
              />
            </span>
          </span>
          {outputSummary && (
            <span className="mt-1 block text-body-sm text-ink-1">
              {outputSummary}
            </span>
          )}
          {!outputSummary && !isAgent && event.service_name && (
            <span className="mt-1 block font-mono text-mono-sm text-ink-3">
              {event.service_name}
            </span>
          )}
        </span>
      </button>

      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0">
          <div className="border-t border-rule px-4 py-4">
            {viewMode === "banker" ? (
              <BankerDetail
                inputsSummary={inputsSummary}
                reasoningTrace={reasoningTrace}
                outputSummary={outputSummary}
                outputFull={outputFull}
                citations={citations}
                tools={tools}
                confidence={confidence}
              />
            ) : (
              <EngineerDetail
                event={event}
                payload={payload}
                model={model}
                modelParams={modelParams}
                tokens={tokens}
                tools={tools}
                citations={citations}
                outputFull={outputFull}
                reasoningTrace={reasoningTrace}
              />
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

// ── banker view body ────────────────────────────────────────────────────

interface BankerDetailProps {
  inputsSummary: string | null;
  reasoningTrace: string;
  outputSummary: string | null;
  outputFull: Record<string, unknown> | null;
  citations: Citation[];
  tools: ToolInvocation[];
  confidence: number | null;
}

const BankerDetail: React.FC<BankerDetailProps> = ({
  inputsSummary,
  reasoningTrace,
  outputSummary,
  outputFull,
  citations,
  tools,
  confidence,
}) => (
  <div className="grid gap-5 md:grid-cols-2">
    <Section label="Inputs">
      <p className="text-body-sm text-ink-1">
        {inputsSummary ?? (
          <span className="italic text-ink-3">No inputs recorded.</span>
        )}
      </p>
    </Section>
    <Section label="What I did">
      <ReasoningPanel trace={reasoningTrace} />
    </Section>
    <Section label="What I found">
      {outputSummary && (
        <p className="text-body-sm text-ink-1">{outputSummary}</p>
      )}
      {outputFull && <StructuredOutputPreview data={outputFull} />}
      {confidence !== null && (
        <p className="mt-2 font-mono text-mono-sm text-ink-3">
          confidence {(confidence * 100).toFixed(0)}%
        </p>
      )}
    </Section>
    <Section label="My sources">
      <CitationList citations={citations} />
    </Section>
    <Section label="Tools used" className="md:col-span-2">
      <ToolInvocationList tools={tools} />
    </Section>
  </div>
);

const StructuredOutputPreview: React.FC<{ data: Record<string, unknown> }> = ({
  data,
}) => {
  const entries = Object.entries(data).slice(0, 5);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-[max-content,1fr] gap-x-3 gap-y-1 rounded-md border border-rule bg-paper-2 p-3">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="font-mono text-mono-sm text-ink-3">{k}</dt>
          <dd className="font-mono text-mono-sm text-ink-1 break-words">
            {typeof v === "string" || typeof v === "number" || typeof v === "boolean"
              ? String(v)
              : JSON.stringify(v)}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

// ── engineer view body ──────────────────────────────────────────────────

interface EngineerDetailProps {
  event: AuditEvent;
  payload: Record<string, unknown>;
  model: string | null;
  modelParams: Record<string, unknown> | null;
  tokens: { input?: number; output?: number; thinking?: number } | null;
  tools: ToolInvocation[];
  citations: Citation[];
  outputFull: Record<string, unknown> | null;
  reasoningTrace: string;
}

const EngineerDetail: React.FC<EngineerDetailProps> = ({
  event,
  payload,
  model,
  modelParams,
  tokens,
  tools,
  citations,
  outputFull,
  reasoningTrace,
}) => {
  const promptText =
    typeof payload.prompt === "string" ? (payload.prompt as string) : null;
  const completionText =
    typeof payload.completion === "string"
      ? (payload.completion as string)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-mono-sm text-ink-2">
        {model && (
          <span>
            <span className="text-ink-3">model</span> {model}
          </span>
        )}
        {modelParams && (
          <span>
            <span className="text-ink-3">params</span>{" "}
            {Object.entries(modelParams)
              .map(([k, v]) => `${k}=${String(v)}`)
              .join(" · ")}
          </span>
        )}
        {tokens && (
          <span>
            <span className="text-ink-3">tokens</span>{" "}
            {tokens.input ?? 0} in · {tokens.output ?? 0} out
            {tokens.thinking ? ` · ${tokens.thinking} thinking` : ""}
          </span>
        )}
      </div>

      <Section label="Reasoning trace">
        <ReasoningPanel trace={reasoningTrace} variant="engineer" />
      </Section>

      {(promptText || completionText) && (
        <Section label="Prompt + completion">
          {promptText && (
            <CodeBlock label="prompt" content={promptText} />
          )}
          {completionText && (
            <CodeBlock label="completion" content={completionText} />
          )}
        </Section>
      )}

      <Section label="Tools">
        <ToolInvocationList tools={tools} variant="engineer" />
      </Section>

      <Section label="Citations">
        <CitationList citations={citations} variant="engineer" />
      </Section>

      {outputFull && (
        <Section label="output_full">
          <CodeBlock
            label="json"
            content={JSON.stringify(outputFull, null, 2)}
          />
        </Section>
      )}

      <Separator />
      <ReplayButton applicationId={event.application_id} eventId={event.id} />
    </div>
  );
};

// ── utility blocks ──────────────────────────────────────────────────────

const Section: React.FC<{
  label: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, className, children }) => (
  <section className={className}>
    <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
      {label}
    </p>
    <div className="mt-1.5">{children}</div>
  </section>
);

const CodeBlock: React.FC<{ label: string; content: string }> = ({
  label,
  content,
}) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-md border border-rule bg-paper-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Toggle ${label} block`}
        className="flex w-full items-center justify-between px-3 py-1.5 font-mono text-mono-sm text-ink-3 hover:text-ink-1"
      >
        <span>{label}</span>
        <span className="text-ink-3">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-rule px-3 py-2 font-mono text-mono-sm text-ink-1">
          {content}
        </pre>
      )}
    </div>
  );
};
