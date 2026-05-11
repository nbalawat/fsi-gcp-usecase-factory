import Link from "next/link";
import { LIVE_DECLINES } from "../lib/data";

export default function HomePage() {
  const sample = LIVE_DECLINES[0]?.id ?? "EVT-SAMPLE";
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option C · decline-reason-actionable proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        Payment fraud · tune the model from the decline stream
      </h1>
      <p className="mt-4 text-ink-2">
        Every declined transaction surfaces its decline reason as a one-click
        action: override (this customer), add-to-allowlist (this merchant), or
        tune-threshold (this rule). The fraud analyst&apos;s job is not to
        approve transactions; it is to tune the model from the decline stream.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/case/${sample}`}
          className="rounded-sm border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          → Open a single declined transaction
        </Link>
        <Link
          href={`/approval/${sample}`}
          className="rounded-sm border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          → Open the bulk decline-stream tuning surface
        </Link>
      </div>
    </main>
  );
}
