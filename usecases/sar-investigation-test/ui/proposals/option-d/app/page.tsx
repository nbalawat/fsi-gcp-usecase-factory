import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option D · counterparty-graph SAR proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        BSA/AML SAR · counterparty graph
      </h1>
      <p className="mt-4 text-ink-2">
        The investigation IS the related-parties graph. Subject sits at the
        center; counterparties surround them; each edge is one transaction
        the alert engine flagged. The BSA investigator clicks nodes to
        expand the ring, selects edges to add to the suspicious sub-graph,
        and the SAR narrative writes itself FROM the selection. Filing the
        SAR is freezing the sub-graph and signing off.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link href="/case/SAMPLE" className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          → Open sample case graph
        </Link>
        <Link href="/approval/SAMPLE" className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2">
          → Open sample SAR filing approval
        </Link>
      </div>
    </main>
  );
}
