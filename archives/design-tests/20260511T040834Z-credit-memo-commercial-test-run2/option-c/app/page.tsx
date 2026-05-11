import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option C · inline-per-section proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        Commercial credit · inline-per-section memo
      </h1>
      <p className="mt-4 text-ink-2">
        The memo reads as five sections (Borrower &amp; Documents, Financial Spread,
        Risk Rating, Memo Draft, Final). Each section ends with the affordance it
        enables — approve / edit / request-revision / reject — so the user&apos;s eye
        never has to leave the section to act on it.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/case/SAMPLE"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          Open sample case memo
        </Link>
        <Link
          href="/approval/SAMPLE"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          Open approval flow
        </Link>
      </div>
    </main>
  );
}
