"use client";

/**
 * Upload error state — surfaces the server message inline and offers a
 * retry button that returns the dropzone to its idle state.
 */

import * as React from "react";
import { AlertTriangle, RefreshCw, FileX } from "lucide-react";
import { cn } from "@/lib/ui";
import { Button } from "@/components/ui/button";

export interface UploadErrorProps {
  file: { name: string; size: number };
  message: string;
  onRetry: () => void;
  compact?: boolean;
}

const KB = 1024;
const fmtBytes = (n: number): string => {
  if (n < KB) return `${n} B`;
  if (n < KB * KB) return `${(n / KB).toFixed(1)} KB`;
  return `${(n / KB / KB).toFixed(1)} MB`;
};

export const UploadError: React.FC<UploadErrorProps> = ({
  file,
  message,
  onRetry,
  compact,
}) => {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-4 rounded-lg border border-semantic-danger/40 bg-semantic-dangerTint/30",
        compact ? "p-5" : "p-6",
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-semantic-danger text-paper">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-h3 font-semi text-ink-1">
            Upload failed
          </p>
          <p className="mt-1 text-body-sm text-ink-2">{message}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-semantic-danger/30 bg-paper px-4 py-3">
        <FileX className="h-4 w-4 flex-shrink-0 text-ink-3" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm text-ink-1">{file.name}</p>
          <p className="font-mono text-mono-sm text-ink-3">
            {fmtBytes(file.size)} · not ingested
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={onRetry} type="button">
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    </div>
  );
};
