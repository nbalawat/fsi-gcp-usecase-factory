"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReplayButtonProps {
  applicationId: string;
  eventId: number;
}

type ReplayState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; message: string }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

/**
 * Re-run a single agent action with the same inputs. Surfaces an "engineer
 * feature" tooltip when the endpoint isn't enabled in this environment so
 * the affordance never reads as broken — it explains itself.
 */
export const ReplayButton: React.FC<ReplayButtonProps> = ({
  applicationId,
  eventId,
}) => {
  const [state, setState] = React.useState<ReplayState>({ kind: "idle" });

  const onClick = React.useCallback(async () => {
    setState({ kind: "running" });
    try {
      const r = await fetch(
        `/api/audit/${encodeURIComponent(applicationId)}/replay/${eventId}`,
        { method: "POST" },
      );
      if (r.status === 501 || r.status === 404) {
        setState({ kind: "unsupported" });
        return;
      }
      if (!r.ok) {
        setState({
          kind: "error",
          message: `Replay failed (HTTP ${r.status}).`,
        });
        return;
      }
      const data = (await r.json()) as { message?: string };
      setState({
        kind: "done",
        message: data.message ?? "Replay queued.",
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Replay failed.",
      });
    }
  }, [applicationId, eventId]);

  const disabled = state.kind === "running";
  const title =
    state.kind === "unsupported"
      ? "Engineer feature — requires explicit opt-in. Replay is not enabled in this environment."
      : "Re-run this action with the same inputs";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        aria-label={`Replay event ${eventId}`}
        title={title}
      >
        <Play aria-hidden className="h-3 w-3" />
        {state.kind === "running" ? "Replaying…" : "Replay action"}
      </Button>
      {state.kind === "done" && (
        <span className="text-mono-sm font-mono text-semantic-success">
          {state.message}
        </span>
      )}
      {state.kind === "unsupported" && (
        <span className="text-mono-sm font-mono text-ink-3">
          engineer feature — opt-in required
        </span>
      )}
      {state.kind === "error" && (
        <span className="text-mono-sm font-mono text-semantic-danger">
          {state.message}
        </span>
      )}
    </div>
  );
};
