import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@fsi-bank/components";

export interface ExecutiveHeaderProps {
  caseId: string;
  borrowerName: string;
  stage: string;
  riskBand: string;
  rightAction?: { label: string; href: string };
}

/**
 * Thin top strip — single 56px row. Replaces the conventional breadcrumb
 * row + secondary nav. Executive density: borrower name dominates, every
 * other element is small mono text.
 */
export const ExecutiveHeader: React.FC<ExecutiveHeaderProps> = ({
  caseId,
  borrowerName,
  stage,
  riskBand,
  rightAction,
}) => (
  <header className="flex h-14 items-center justify-between border-b border-rule bg-paper px-8">
    <div className="flex items-baseline gap-4 min-w-0">
      <Link
        href="/"
        className="font-mono text-mono-sm text-ink-3 hover:text-ink-1"
      >
        ← Floor
      </Link>
      <h1 className="font-serif text-h3 font-semi text-ink-1 truncate">
        {borrowerName}
      </h1>
      <span className="font-mono text-mono-sm text-ink-3">{caseId}</span>
    </div>
    <div className="flex items-center gap-3">
      <StatusBadge kind="neutral">{stage}</StatusBadge>
      <StatusBadge kind={riskBand.startsWith("1") ? "success" : "warning"}>
        {riskBand}
      </StatusBadge>
      {rightAction && (
        <Link
          href={rightAction.href}
          className="rounded-sm border border-rule px-3 py-1 text-mono-sm font-mono text-ink-1 hover:bg-paper-2"
        >
          {rightAction.label}
        </Link>
      )}
    </div>
  </header>
);
