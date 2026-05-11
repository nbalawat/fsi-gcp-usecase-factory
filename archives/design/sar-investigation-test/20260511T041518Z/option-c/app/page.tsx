import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option C - inline-evidence narrative proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        SAR investigation - annotated narrative
      </h1>
      <p className="mt-4 text-ink-2">
        The narrative is the page. Every claim carries an inline citation
        chip - click it to see the transaction record, account history, or
        geography signal behind the claim. Inline dispute / flag / note
        actions live next to each claim, and the approval surface is the
        annotated narrative itself.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link href="/case/SAR-2026-04891" className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          - Open SAR narrative (case detail)
        </Link>
        <Link href="/approval/SAR-2026-04891" className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          - Open annotated approval flow
        </Link>
      </div>
    </main>
  );
}
