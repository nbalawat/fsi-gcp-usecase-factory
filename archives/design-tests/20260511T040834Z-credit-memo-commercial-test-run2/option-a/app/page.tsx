import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-16">
      <div className="mb-4 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option A · sparse-executive proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        Commercial credit · executive view
      </h1>
      <p className="mt-4 text-ink-2">
        Designed for a Chief Credit Officer who scans the case in 30 seconds.
        The recommendation IS the page. Everything else is compressed to a
        single tiny right rail.
      </p>
      <div className="mt-10 flex flex-col gap-3">
        <Link
          href="/case/SAMPLE"
          className="rounded-sm border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          Open sample case
        </Link>
        <Link
          href="/approval/SAMPLE"
          className="rounded-sm border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          Open sample approval
        </Link>
      </div>
    </main>
  );
}
