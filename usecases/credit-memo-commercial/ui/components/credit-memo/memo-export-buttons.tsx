"use client";

/**
 * Two header-row export actions for the credit memo:
 *   1. "Print / save as PDF" — opens the dedicated print route in a new tab.
 *      The print page calls window.print() once it has fully rendered, so the
 *      browser's PDF dialog appears within ~500 ms of the click.
 *   2. "Copy memo as Markdown" — runs the memoToMarkdown serializer in-process
 *      and writes the result to the clipboard.
 *
 * Buttons are disabled while no memo body is loaded.
 */

import * as React from "react";
import { Printer, ClipboardCopy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { memoToMarkdown } from "../../lib/memo-markdown";
import type { CreditMemoBody } from "./types";

interface Props {
  applicationId: string;
  memo: Partial<CreditMemoBody> | null;
  /** Tag the print URL with `?mock=1` if we're rendering from the fixture. */
  mock?: boolean;
  /** Compact (icon-only) variant — used in slim sticky top bars. */
  compact?: boolean;
}

export const MemoExportButtons: React.FC<Props> = ({
  applicationId,
  memo,
  mock = false,
  compact = false,
}) => {
  const [copied, setCopied] = React.useState(false);
  const ready = memo && Object.keys(memo).length > 0;

  const onPrint = () => {
    const qs = mock ? "?mock=1" : "";
    const url = `/cases/${encodeURIComponent(applicationId)}/memo/print${qs}`;
    if (typeof window !== "undefined") window.open(url, "_blank");
  };

  const onCopy = async () => {
    if (!memo || !memo.executive_summary) return;
    try {
      const md = memoToMarkdown(memo as CreditMemoBody);
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Fall back to creating a temporary textarea.
      const ta = document.createElement("textarea");
      ta.value = memoToMarkdown(memo as CreditMemoBody);
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onPrint}
          disabled={!ready}
          aria-label="Print or save the memo as PDF"
          title="Print / save as PDF"
        >
          <Printer className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCopy}
          disabled={!ready}
          aria-label="Copy memo as Markdown"
          title={copied ? "Copied" : "Copy as Markdown"}
        >
          {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onPrint}
        disabled={!ready}
        aria-label="Print or save the memo as PDF"
      >
        <Printer className="h-3.5 w-3.5" />
        Print / save as PDF
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onCopy}
        disabled={!ready}
        aria-label="Copy memo as Markdown"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Copied
          </>
        ) : (
          <>
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy as Markdown
          </>
        )}
      </Button>
    </div>
  );
};
