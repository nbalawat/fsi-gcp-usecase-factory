import Link from "next/link";

export default function NotFound(): JSX.Element {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">Case not found</h1>
      <p className="text-sm text-text-secondary">
        The requested loan id is not in the demo dataset.
      </p>
      <Link
        href="/"
        className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-text-inverse"
      >
        Back to pipeline
      </Link>
    </div>
  );
}
