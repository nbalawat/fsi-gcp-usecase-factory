import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option A · density proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        Commercial credit · Sparse executive
      </h1>
      <p className="mt-4 text-ink-2">
        The artifact (the recommendation hero) IS the page. Chrome compresses to a header strip plus right-rail. Approval flow is single-column where decided gates collapse to one-line strips.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link href="/case/SAMPLE" className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          → Open sample case
        </Link>
        <Link href="/approval/SAMPLE" className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          → Open sample approval flow
        </Link>
      </div>
    </main>
  );
}
