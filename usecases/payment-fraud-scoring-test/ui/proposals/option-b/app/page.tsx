import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <div className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-3">
        Option B · model-first proposal
      </div>
      <h1 className="font-serif text-4xl text-ink-1">
        Real-time fraud scoring · model health monitor
      </h1>
      <p className="mt-4 text-ink-2">
        The page IS the model. Score distribution, feature firing rates,
        and the latest gray-zone sample are the primary surface — individual
        transactions are samples contributing to the curve, not the unit of
        attention. Human disposition lives in the policy-tuning route, not on
        the transaction itself.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/case/TX-26F4-001"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          → Open sample transaction (one point on the curve)
        </Link>
        <Link
          href="/approval/policy"
          className="rounded border border-rule px-4 py-3 text-sm text-ink-1 hover:bg-paper-2"
        >
          → Open policy tuning (no HITL per case — humans tune rules)
        </Link>
      </div>
    </main>
  );
}
