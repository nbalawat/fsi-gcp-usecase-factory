"use client";

/**
 * Upload success — the application has been published to Pub/Sub. The
 * orchestrator is now running the 5-step pipeline asynchronously; we offer
 * a link straight to the case detail where useLiveCase() shows live state.
 */

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight, FileText } from "lucide-react";
import { cn } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface UploadSuccessProps {
  file: { name: string; size: number };
  applicationId: string;
  parseQuality: "high" | "medium" | "low" | "fallback";
  compact?: boolean;
}

const KB = 1024;
const fmtBytes = (n: number): string => {
  if (n < KB) return `${n} B`;
  if (n < KB * KB) return `${(n / KB).toFixed(1)} KB`;
  return `${(n / KB / KB).toFixed(1)} MB`;
};

const QUALITY_TONE: Record<UploadSuccessProps["parseQuality"], "success" | "info" | "warning"> = {
  high: "success",
  medium: "success",
  low: "warning",
  fallback: "info",
};

const QUALITY_LABEL: Record<UploadSuccessProps["parseQuality"], string> = {
  high: "Extraction complete",
  medium: "Extraction complete",
  low: "Partial extraction",
  fallback: "Curated fallback",
};

export const UploadSuccess: React.FC<UploadSuccessProps> = ({
  file,
  applicationId,
  parseQuality,
  compact,
}) => {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-4 rounded-lg border border-semantic-success/40 bg-semantic-successTint/30 animate-in fade-in zoom-in-95 duration-300",
        compact ? "p-5" : "p-6",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-semantic-success text-paper">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-serif text-h3 font-semi text-ink-1">
              Processing your application
            </p>
            <Badge tone={QUALITY_TONE[parseQuality]} dot>
              {QUALITY_LABEL[parseQuality]}
            </Badge>
          </div>
          <p className="mt-1 text-body-sm text-ink-2">
            This typically takes 60-90 seconds end-to-end. You can watch the
            agents run live on the case detail.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-semantic-success/30 bg-paper px-4 py-3">
        <FileText className="h-4 w-4 flex-shrink-0 text-ink-3" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm text-ink-1">{file.name}</p>
          <p className="font-mono text-mono-sm text-ink-3">
            {fmtBytes(file.size)} · application{" "}
            <span className="text-ink-2">{applicationId.slice(0, 8)}…</span>
          </p>
        </div>
        <Button asChild variant="primary" size="sm">
          <Link href={`/cases/${encodeURIComponent(applicationId)}`}>
            Open case
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <p className="text-body-sm text-ink-3">
        The application will appear in the queue below within a few seconds as
        each pipeline stage completes.
      </p>
    </div>
  );
};
