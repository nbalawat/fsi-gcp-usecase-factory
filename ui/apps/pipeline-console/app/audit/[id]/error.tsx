"use client";

/**
 * Route-level error boundary for /audit/[id].
 * See companion file at app/cases/[id]/error.tsx for the rationale.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AuditRouteError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[audit-route-error]", { message: error.message, digest: error.digest, stack: error.stack });
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-md border border-semantic-warning/40 bg-semantic-warningTint/30 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" />
          <div className="flex-1">
            <p className="text-eyebrow uppercase tracking-[0.06em] text-semantic-warning font-mono">
              Audit trail unavailable
            </p>
            <h1 className="mt-1 font-serif text-h2 font-semi text-ink-1">
              We couldn't render the audit trail right now
            </h1>
            <p className="mt-2 font-serif text-body-sm text-ink-2">
              The underlying application_events rows are intact. This is
              a render-side issue; retry usually clears it.
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-mono-sm text-ink-3">
                Error reference: <span className="text-ink-2">{error.digest}</span>
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-paper px-3 py-1.5 text-body-sm text-ink-1 hover:bg-paper-2"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-paper px-3 py-1.5 text-body-sm text-ink-1 hover:bg-paper-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
