import * as React from "react";
import Link from "next/link";

export default function HomePage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option B · regulatory-clock-first proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        BSA / AML SAR · the 30-day clock
      </h1>
      <p className="mt-4 text-ink-2">
        Every section of the investigation hangs off the 30-day SAR regime —
        large, ticking clock at the top of the viewport; below it, the case
        reads as a sequence of &ldquo;what happens by when&rdquo; anchored to
        the days-remaining axis.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/case/SAR-2026-AC-119884-001"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          → Open sample case (clock-first view)
        </Link>
        <Link
          href="/approval/SAR-2026-AC-119884-001"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          → Open sample approval flow (final SAR signoff)
        </Link>
      </div>
    </main>
  );
}
