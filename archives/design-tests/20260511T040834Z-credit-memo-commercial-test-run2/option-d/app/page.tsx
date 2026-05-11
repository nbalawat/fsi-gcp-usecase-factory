import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option D · run 2 · provenance-graph proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        Commercial credit · provenance graph
      </h1>
      <p className="mt-4 text-ink-2">
        Each case is a directed graph of values. Every extracted figure
        carries its citation (page, bbox, excerpt, confidence) on the
        card; every computed figure names its upstream sources; every
        decision names every value it consumed. Click any value to walk
        its full backward chain to the document and its full forward
        chain to the credit decision.
      </p>
      <p className="mt-3 text-ink-2">
        The approval flow reframes each HITL gate as a trust attestation
        over the subtree of values feeding that gate&rsquo;s decision.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/case/SAMPLE"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          → Open sample case · provenance graph
        </Link>
        <Link
          href="/approval/SAMPLE"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          → Open sample approval · trust attestation
        </Link>
      </div>
    </main>
  );
}
