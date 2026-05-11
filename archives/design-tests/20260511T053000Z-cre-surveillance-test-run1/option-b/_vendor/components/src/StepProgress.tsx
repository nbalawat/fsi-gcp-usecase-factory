import * as React from "react";

export type StepStatus = "done" | "active" | "pending" | "error";

export interface StepProgressProps {
  /** Total number of pipeline steps. */
  total: number;
  /** Number of completed steps. */
  done: number;
  /** Status — drives the active step color. */
  status: StepStatus;
  /** Optional currently-active step label, e.g. "rules". */
  currentLabel?: string;
  /** Compact mode: smaller dots, no label. */
  compact?: boolean;
}

const statusColor: Record<StepStatus, string> = {
  done: "var(--success)",
  active: "var(--accent)",
  pending: "var(--ink-4)",
  error: "var(--danger)",
};

/**
 * Inline 5-dot pipeline progress used in dense table rows.
 * "3/5 rules" — three filled, one in-progress (animated), one pending.
 */
export const StepProgress: React.FC<StepProgressProps> = ({
  total,
  done,
  status,
  currentLabel,
  compact,
}) => {
  const dotSize = compact ? 5 : 6;
  const gap = compact ? 3 : 4;
  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-mono-sm text-ink-2"
      aria-label={`Step ${done} of ${total}${currentLabel ? ` · ${currentLabel}` : ""}`}
    >
      <span className="inline-flex items-center" style={{ gap }}>
        {Array.from({ length: total }).map((_, i) => {
          const isDone = i < done;
          const isActive = i === done && status !== "done";
          const fill = isDone
            ? "var(--success)"
            : isActive
              ? statusColor[status]
              : "var(--ink-4)";
          return (
            <span
              key={i}
              aria-hidden
              className={
                isActive && status === "active"
                  ? "animate-pulse"
                  : ""
              }
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: 9999,
                background: fill,
                opacity: isDone ? 1 : isActive ? 1 : 0.45,
              }}
            />
          );
        })}
      </span>
      {!compact && (
        <>
          <span className="tabular-nums">
            {done}/{total}
          </span>
          {currentLabel && <span className="text-ink-3">· {currentLabel}</span>}
        </>
      )}
    </span>
  );
};
