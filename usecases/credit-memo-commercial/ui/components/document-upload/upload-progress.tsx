"use client";

/**
 * Upload progress state — shown while the server is parsing the PDF and
 * publishing the synthetic loan application to Pub/Sub. This is a short
 * window (~1-2s for the request itself); the longer ~60-90s "live agent
 * activity" then happens on the case detail page.
 */

import * as React from "react";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/ui";

export interface UploadProgressProps {
  file: { name: string; size: number };
  compact?: boolean;
}

const KB = 1024;
const fmtBytes = (n: number): string => {
  if (n < KB) return `${n} B`;
  if (n < KB * KB) return `${(n / KB).toFixed(1)} KB`;
  return `${(n / KB / KB).toFixed(1)} MB`;
};

export const UploadProgress: React.FC<UploadProgressProps> = ({ file, compact }) => {
  const [stage, setStage] = React.useState<"parsing" | "posting">("parsing");

  // Visual stage advance — gives the eye something to track even though the
  // real fetch is one round-trip. Real progression is shown on the case
  // detail page once we have an application_id.
  React.useEffect(() => {
    const t = setTimeout(() => setStage("posting"), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-4 rounded-lg border border-rule bg-paper",
        compact ? "p-5" : "p-6",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent-pressed">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink-1">{file.name}</p>
          <p className="font-mono text-mono-sm text-ink-3">{fmtBytes(file.size)} · PDF</p>
        </div>
        <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-accent-pressed" />
      </div>

      <ol className="flex flex-col gap-2">
        <Step
          label="Parsing financials"
          sub="Extracting MD&A, income statement, and balance-sheet line items"
          state={stage === "parsing" ? "active" : "done"}
        />
        <Step
          label="Posting to pipeline"
          sub="Publishing to loans.application.submitted"
          state={stage === "posting" ? "active" : "pending"}
        />
        <Step
          label="Awaiting orchestrator"
          sub="Handler enriches and routes to spreading…"
          state="pending"
        />
      </ol>
    </div>
  );
};

const Step: React.FC<{
  label: string;
  sub: string;
  state: "pending" | "active" | "done";
}> = ({ label, sub, state }) => (
  <li className="flex items-start gap-3">
    <span
      aria-hidden
      className={cn(
        "mt-1 h-2 w-2 flex-shrink-0 rounded-full",
        state === "done" && "bg-semantic-success",
        state === "active" && "bg-accent animate-pulse",
        state === "pending" && "bg-paper-3 ring-1 ring-rule",
      )}
    />
    <div className="min-w-0">
      <p
        className={cn(
          "text-body-sm",
          state === "done" && "text-semantic-success font-semi",
          state === "active" && "text-ink-1 font-semi",
          state === "pending" && "text-ink-3",
        )}
      >
        {label}
      </p>
      <p className="text-body-sm text-ink-3">{sub}</p>
    </div>
  </li>
);
