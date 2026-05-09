"use client";

/**
 * Route-level error boundary for /cases/[id]/...
 *
 * Per ui-standards.md §4.10 + agentic-ui-principles Track B (memo-render
 * hardening): when a Server Component throws (most often an undefined
 * field on partial agent output), we render a graceful retry tile
 * instead of letting Next.js return a 500 page. The user sees a banker-
 * readable message + a retry button, while the audit trail of what
 * went wrong is captured client-side for engineers.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CaseRouteError({ error, reset }: Props) {
  useEffect(() => {
    // Engineer-side capture; production wires this to an APM
    console.error("[case-route-error]", { message: error.message, digest: error.digest, stack: error.stack });
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-md border border-semantic-warning/40 bg-semantic-warningTint/30 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" />
          <div className="flex-1">
            <p className="text-eyebrow uppercase tracking-[0.06em] text-semantic-warning font-mono">
              Case unavailable
            </p>
            <h1 className="mt-1 font-serif text-h2 font-semi text-ink-1">
              We couldn't render this case right now
            </h1>
            <p className="mt-2 font-serif text-body-sm text-ink-2">
              The case data may still be processing, or one of its
              sections returned an unexpected shape. The pipeline run is
              unaffected — your audit trail and the underlying
              application_state row are intact.
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
                Back to queue
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
