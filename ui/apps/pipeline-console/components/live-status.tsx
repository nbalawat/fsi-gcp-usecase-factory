"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { Badge } from "./ui/badge";
import { cn } from "../lib/ui";

interface LiveData {
  overall: "healthy" | "degraded" | "down";
  summary: string;
  services: Array<{ name: string; role: string; state: "up" | "unknown" }>;
  checked_at: string;
}

/**
 * Live indicator — fetches /api/live every 10s and shows real status of
 * the deployed Cloud Run services. Confirms the pipeline is actually up.
 */
export const LiveStatus: React.FC = () => {
  const [data, setData] = React.useState<LiveData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pulse, setPulse] = React.useState(0);

  const fetchStatus = React.useCallback(async () => {
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {
      // network blip — keep last known good
    } finally {
      setLoading(false);
      setPulse((p) => p + 1);
    }
  }, []);

  React.useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 10_000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  if (loading || !data) {
    return (
      <div className="inline-flex h-7 items-center gap-2 rounded-md border border-rule px-2 text-mono-sm font-mono text-ink-3">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Checking…
      </div>
    );
  }

  const Icon =
    data.overall === "healthy"
      ? CheckCircle2
      : data.overall === "degraded"
        ? AlertTriangle
        : XCircle;
  const tone =
    data.overall === "healthy"
      ? "success"
      : data.overall === "degraded"
        ? "warning"
        : "danger";
  const label =
    data.overall === "healthy"
      ? "Pipeline live"
      : data.overall === "degraded"
        ? "Pipeline degraded"
        : "Pipeline down";

  return (
    <div className="flex items-center gap-2">
      <Badge tone={tone as any} dot>
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
      <span className="font-mono text-mono-sm text-ink-3">
        {data.summary}
      </span>
      <span
        key={pulse}
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "success" && "bg-semantic-success",
          tone === "warning" && "bg-semantic-warning",
          tone === "danger" && "bg-semantic-danger",
          "animate-ping",
        )}
        style={{ animationDuration: "2s" }}
      />
    </div>
  );
};
