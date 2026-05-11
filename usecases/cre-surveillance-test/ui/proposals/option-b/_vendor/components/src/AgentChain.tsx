"use client";

import * as React from "react";

export type AgentStatus = "idle" | "running" | "done" | "blocked" | "error";

export interface AgentNode {
  /** Stable id (matches the agent role in agents/<uc>/<role>.py) */
  id: string;
  /** Display name — e.g. "extractor", "rater", "drafter", "supervisor" */
  role: string;
  /** Model — e.g. "claude-opus-4-7", "gemini-3-1-flash" */
  model?: string;
  /** Current status */
  status: AgentStatus;
  /** Confidence 0..1 of this agent's output (after status=done) */
  confidence?: number;
  /** Latency in ms */
  latencyMs?: number;
  /** One-line summary of what this agent did or is doing */
  message?: string;
  /** Tool calls or atomic services this agent invoked */
  toolsUsed?: string[];
  /** Memory scope — e.g. "borrower" / "case" / "session" */
  memoryScope?: string;
}

export interface AgentChainProps {
  /** The pattern instantiated — e.g. "extractor-spreader-rater-drafter@1.0" */
  pattern: string;
  /** Supervisor agent (rendered above the chain) */
  supervisor?: AgentNode;
  /** Specialist chain in order */
  agents: AgentNode[];
  /** Optional context id displayed in the header */
  contextId?: string;
}

const statusStyles: Record<
  AgentStatus,
  { dot: string; ring: string; chip: string; bg: string }
> = {
  idle:    { dot: "bg-ink-3",        ring: "ring-rule",                bg: "bg-paper-2",      chip: "text-ink-3" },
  running: { dot: "bg-accent",       ring: "ring-accent/50",           bg: "bg-accent-tint",  chip: "text-accent-pressed" },
  done:    { dot: "bg-semantic-success", ring: "ring-semantic-successTint", bg: "bg-semantic-successTint", chip: "text-semantic-success" },
  blocked: { dot: "bg-semantic-warning", ring: "ring-semantic-warningTint", bg: "bg-semantic-warningTint", chip: "text-semantic-warning" },
  error:   { dot: "bg-semantic-danger",  ring: "ring-semantic-dangerTint",  bg: "bg-semantic-dangerTint",  chip: "text-semantic-danger" },
};

/**
 * Renders the multi-agent chain for one case.
 *
 * Visualizes a supervisor + specialist pattern (e.g. extractor → rater → drafter):
 * each agent is a card with model, status, confidence, latency, and the tools it
 * invoked. The arrows show data flow. Active agent gets the brand accent ring.
 *
 * Designed for the credit-memo "extractor-spreader-rater-drafter@1.0" pattern but
 * works for any pattern in libraries/patterns/.
 */
export const AgentChain: React.FC<AgentChainProps> = ({
  pattern,
  supervisor,
  agents,
  contextId,
}) => {
  return (
    <section
      aria-label="Multi-agent chain"
      className="flex flex-col gap-3 rounded-md border border-rule bg-paper p-4"
    >
      <header className="flex items-baseline justify-between">
        <div>
          <div className="eyebrow">Multi-agent pattern</div>
          <h3 className="font-serif text-h3 font-semi text-ink-1">{pattern}</h3>
        </div>
        {contextId && (
          <span className="font-mono text-mono-sm text-ink-3">
            ctx · {contextId}
          </span>
        )}
      </header>

      {supervisor && (
        <SupervisorCard agent={supervisor} />
      )}

      <ol className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {agents.map((a, i) => (
          <React.Fragment key={a.id}>
            <li className="min-w-[14rem] flex-1">
              <AgentCard agent={a} />
            </li>
            {i < agents.length - 1 && (
              <li
                aria-hidden
                className="flex flex-shrink-0 items-center px-1 text-ink-3"
              >
                <Arrow status={agents[i + 1].status} />
              </li>
            )}
          </React.Fragment>
        ))}
      </ol>
    </section>
  );
};

const SupervisorCard: React.FC<{ agent: AgentNode }> = ({ agent }) => {
  const s = statusStyles[agent.status];
  return (
    <div
      className={`flex items-center gap-3 rounded-md border border-rule p-3 ${s.bg}`}
    >
      <span className={`status-dot ${s.dot}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-ui font-medium text-ink-1">
            supervisor · {agent.role}
          </span>
          {agent.model && (
            <span className="font-mono text-mono-sm text-ink-3">
              {agent.model}
            </span>
          )}
        </div>
        {agent.message && (
          <p className="mt-0.5 text-caption text-ink-2 truncate">
            {agent.message}
          </p>
        )}
      </div>
      <span className={`font-mono text-mono-sm uppercase ${s.chip}`}>
        {agent.status}
      </span>
    </div>
  );
};

const AgentCard: React.FC<{ agent: AgentNode }> = ({ agent }) => {
  const s = statusStyles[agent.status];
  const conf =
    agent.confidence !== undefined
      ? `${Math.round(agent.confidence * 100)}%`
      : "—";
  return (
    <article
      className={`flex h-full flex-col gap-2 rounded-md border border-rule p-3 ring-1 ${s.ring} ${s.bg}`}
    >
      <header className="flex items-center gap-2">
        <span className={`status-dot ${s.dot}`} aria-hidden />
        <span className="text-ui font-medium text-ink-1">{agent.role}</span>
        <span className={`ml-auto font-mono text-[10px] uppercase ${s.chip}`}>
          {agent.status}
        </span>
      </header>

      {agent.message && (
        <p className="text-caption text-ink-2 leading-snug">{agent.message}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-mono-sm font-mono text-ink-3">
        {agent.model && (
          <div className="col-span-2 truncate">
            <dt className="sr-only">Model</dt>
            <dd>{agent.model}</dd>
          </div>
        )}
        <div>
          <dt className="sr-only">Confidence</dt>
          <dd className="text-ink-1">conf {conf}</dd>
        </div>
        {agent.latencyMs !== undefined && (
          <div>
            <dt className="sr-only">Latency</dt>
            <dd>{agent.latencyMs}ms</dd>
          </div>
        )}
        {agent.memoryScope && (
          <div className="col-span-2">
            <dt className="sr-only">Memory scope</dt>
            <dd>memory · {agent.memoryScope}</dd>
          </div>
        )}
      </dl>

      {agent.toolsUsed && agent.toolsUsed.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 border-t border-rule pt-2">
          {agent.toolsUsed.map((t) => (
            <span
              key={t}
              className="rounded-sm bg-paper-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
};

const Arrow: React.FC<{ status: AgentStatus }> = ({ status }) => (
  <svg
    width="20"
    height="14"
    viewBox="0 0 20 14"
    fill="none"
    aria-hidden
    className={
      status === "running" || status === "done"
        ? "text-accent"
        : "text-ink-4"
    }
  >
    <path
      d="M0 7h17M13 3l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
