import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option A · sparse-executive proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        SAR Investigation · sparse executive view
      </h1>
      <p className="mt-4 text-ink-2">
        A BSA Officer scans 30+ cases a day. Each case answers three
        questions in one glance: what is the decision, how much time is left
        on the 30-day SAR clock, and what is the single alert reason that
        explains this case. Everything else compresses to a tiny right rail.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link href="/case/SAR-2026-04891" className="rounded-sm border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          → Open sample case
        </Link>
        <Link href="/approval/SAR-2026-04891" className="rounded-sm border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          → Open approval gate (file / dismiss / escalate)
        </Link>
      </div>
    </main>
  );
}
