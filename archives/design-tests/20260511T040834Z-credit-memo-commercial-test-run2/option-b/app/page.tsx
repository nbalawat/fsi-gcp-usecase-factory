import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option B · workflow-first proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        Commercial credit · workflow-first console
      </h1>
      <p className="mt-4 text-ink-2">
        Stages drive the layout. The current stage is the hero; prior
        stages compress to a left rail with status pills; future stages
        are dimmed but visible. The pipeline is the spine of the page.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/case/SAMPLE"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          Open sample case (workflow view)
        </Link>
        <Link
          href="/approval/SAMPLE"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          Open sample approval flow
        </Link>
      </div>
    </main>
  );
}
