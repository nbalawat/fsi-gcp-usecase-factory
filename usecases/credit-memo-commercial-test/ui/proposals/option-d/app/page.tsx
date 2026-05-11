import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option D · conversation-timeline proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        Commercial credit · conversation timeline
      </h1>
      <p className="mt-4 text-ink-2">
        Each case reads top-to-bottom as a transcript of every agent reasoning,
        atomic service call, rule verdict, and human decision. The same surface
        carries the approval flow, scoped to the slice that produced each gate.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link href="/case/SAMPLE" className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          → Open sample case transcript
        </Link>
        <Link href="/approval/SAMPLE" className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          → Open sample approval flow
        </Link>
      </div>
    </main>
  );
}
