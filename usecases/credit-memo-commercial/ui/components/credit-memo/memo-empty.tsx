"use client";

/**
 * Empty state for the credit memo — the case has no memo at all yet (e.g. it's
 * still in the intake stage). Friendly copy, estimated time, no placeholder
 * sections (those are handled by <MemoSectionSkeleton> when drafting begins).
 */

import * as React from "react";
import { FileText } from "lucide-react";

export const MemoEmpty: React.FC = () => {
  return (
    <div className="rounded-lg border border-border bg-paper p-10 text-center">
      <FileText
        className="mx-auto h-9 w-9 text-muted-foreground/70"
        aria-hidden
        strokeWidth={1.5}
      />
      <h3 className="mt-4 font-serif text-h3 font-semi text-foreground">
        Credit memo not yet drafted
      </h3>
      <p className="mx-auto mt-2 max-w-md text-body-sm text-muted-foreground leading-snug">
        The memo will appear here once the AI underwriter has completed its
        analysis. The drafter is invoked automatically when the case enters the
        analysis stage.
      </p>
      <p className="mt-3 font-mono text-mono-sm text-muted-foreground">
        Typical drafting time: 60–90 seconds
      </p>
    </div>
  );
};
