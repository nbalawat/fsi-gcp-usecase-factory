"use client";

import * as React from "react";

export interface RegulatoryClockProps {
  /** ISO timestamp the clock started */
  startedAt: string;
  /** ISO timestamp the deadline expires at */
  deadline: string;
  /** Display name of the regime, e.g. "OCC 5-business-day" */
  regulatoryRegime: string;
  /** If provided, used instead of new Date() — useful for tests / SSR */
  now?: Date;
  /** Hours-remaining threshold below which the clock turns red */
  redAtHoursRemaining?: number;
  /** Hours-remaining threshold below which the clock turns amber */
  amberAtHoursRemaining?: number;
}

interface Computed {
  elapsedPct: number;
  hoursRemaining: number;
  breached: boolean;
  band: "ok" | "warning" | "critical" | "breach";
  countdown: string;
}

const computeState = (
  startedAt: string,
  deadline: string,
  now: Date,
  amberAt: number,
  redAt: number,
): Computed => {
  const start = new Date(startedAt).getTime();
  const end = new Date(deadline).getTime();
  const t = now.getTime();

  const total = Math.max(1, end - start);
  const elapsed = Math.max(0, t - start);
  const elapsedPct = Math.min(100, Math.round((elapsed / total) * 100));
  const remainingMs = end - t;
  const hoursRemaining = remainingMs / (1000 * 60 * 60);
  const breached = remainingMs <= 0;

  let band: Computed["band"] = "ok";
  if (breached) band = "breach";
  else if (hoursRemaining <= redAt) band = "critical";
  else if (hoursRemaining <= amberAt) band = "warning";

  const absSec = Math.max(0, Math.floor(Math.abs(remainingMs) / 1000));
  const days = Math.floor(absSec / 86400);
  const hours = Math.floor((absSec % 86400) / 3600);
  const mins = Math.floor((absSec % 3600) / 60);
  const secs = absSec % 60;
  const sign = breached ? "-" : "";
  const countdown = `${sign}${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;

  return { elapsedPct, hoursRemaining, breached, band, countdown };
};

const bandClasses: Record<Computed["band"], string> = {
  ok: "border-status-ok/40 bg-status-okBg text-status-ok",
  warning: "border-status-warning/50 bg-status-warningBg text-status-warning",
  critical: "border-status-critical/60 bg-status-criticalBg text-status-critical",
  breach: "border-status-critical bg-status-critical text-text-inverse",
};

/**
 * Regulatory deadline countdown. Green / amber / red bands.
 * Live-ticks once a second when mounted in the browser.
 */
export const RegulatoryClock: React.FC<RegulatoryClockProps> = ({
  startedAt,
  deadline,
  regulatoryRegime,
  now,
  redAtHoursRemaining = 8,
  amberAtHoursRemaining = 24,
}) => {
  const [tick, setTick] = React.useState<Date>(now ?? new Date());

  React.useEffect(() => {
    if (now) return; // frozen-clock mode for tests
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, [now]);

  const state = computeState(
    startedAt,
    deadline,
    tick,
    amberAtHoursRemaining,
    redAtHoursRemaining,
  );

  return (
    <section
      aria-label={`${regulatoryRegime} clock`}
      data-band={state.band}
      className={`flex flex-col gap-2 rounded-md border p-4 ${bandClasses[state.band]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide">
          {regulatoryRegime}
        </span>
        <span className="text-[10px] uppercase tracking-wide opacity-80">
          {state.breached ? "Breached" : state.band}
        </span>
      </div>
      <div className="font-mono text-2xl font-semibold tabular-nums">
        {state.countdown}
      </div>
      <div
        className="h-2 w-full rounded-full bg-black/10"
        role="progressbar"
        aria-valuenow={state.elapsedPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-current transition-all"
          style={{ width: `${state.elapsedPct}%` }}
        />
      </div>
      {state.breached && (
        <div className="text-xs font-semibold">
          Deadline breached. Escalation required.
        </div>
      )}
    </section>
  );
};
