import * as React from "react";
import type { AgentNode, AgentStatus } from "./AgentChain";

export interface AgentMiniProps {
  pattern: string;
  supervisor?: AgentNode;
  agents: AgentNode[];
}

const statusTone: Record<
  AgentStatus,
  { dot: string; chip: string }
> = {
  idle:    { dot: "bg-ink-3",            chip: "text-ink-3" },
  running: { dot: "bg-accent",           chip: "text-accent-pressed" },
  done:    { dot: "bg-semantic-success", chip: "text-semantic-success" },
  blocked: { dot: "bg-semantic-warning", chip: "text-semantic-warning" },
  error:   { dot: "bg-semantic-danger",  chip: "text-semantic-danger" },
};

/**
 * Compact vertical agent list — for narrow side drawers (≤ 420px).
 * Use AgentChain in wide bands (case detail page) where each specialist
 * card needs ~14rem of horizontal space.
 */
export const AgentMini: React.FC<AgentMiniProps> = ({
  pattern,
  supervisor,
  agents,
}) => (
  <section
    aria-label="Agents"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="border-b border-rule px-3 py-2">
      <div className="eyebrow">Multi-agent pattern</div>
      <h3 className="font-mono text-mono-sm text-ink-1 truncate">{pattern}</h3>
    </header>
    <ul className="flex flex-col">
      {supervisor && <AgentRow agent={supervisor} isSupervisor />}
      {agents.map((a) => (
        <AgentRow key={a.id} agent={a} />
      ))}
    </ul>
  </section>
);

const AgentRow: React.FC<{ agent: AgentNode; isSupervisor?: boolean }> = ({
  agent,
  isSupervisor,
}) => {
  const tone = statusTone[agent.status];
  const conf =
    agent.confidence !== undefined
      ? `${Math.round(agent.confidence * 100)}%`
      : null;
  return (
    <li className="border-b border-rule px-3 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden />
        <span className="text-ui font-medium text-ink-1">
          {isSupervisor ? `supervisor · ${agent.role}` : agent.role}
        </span>
        <span className={`ml-auto font-mono text-[10px] uppercase ${tone.chip}`}>
          {agent.status}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 font-mono text-mono-sm text-ink-3">
        {agent.model && <span className="truncate">{agent.model}</span>}
        {conf && <span>· conf {conf}</span>}
        {agent.latencyMs !== undefined && <span>· {agent.latencyMs}ms</span>}
      </div>
      {agent.message && (
        <p className="mt-1 text-caption text-ink-2 leading-snug">
          {agent.message}
        </p>
      )}
      {agent.toolsUsed && agent.toolsUsed.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {agent.toolsUsed.map((t) => (
            <span
              key={t}
              className="rounded-sm bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </li>
  );
};
