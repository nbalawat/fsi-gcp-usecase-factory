// rule-4.16-exception: memo-focused view; spine lives on the parent /cases/[id]
import { AppShell } from "@fsi-bank/components";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "../../../../components/ui/button";
import { Separator } from "../../../../components/ui/separator";
import { LiveStatus } from "../../../../components/live-status";
import {
  getActiveCases,
  getCase,
  getMemoArtifact,
} from "@uc/lib/live-data";
import { CreditMemoDocument } from "@uc/components/credit-memo/credit-memo-document";
import { MemoEmpty } from "@uc/components/credit-memo/memo-empty";
import { MemoExportButtons } from "@uc/components/credit-memo/memo-export-buttons";
import { LECO_MEMO_FIXTURE } from "@uc/lib/memo-fixtures";
import type { CreditMemoBody } from "@uc/components/credit-memo/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
  searchParams?: { mock?: string };
}

const navItems = (n: number) => [
  { id: "overview", label: "Pipeline overview", icon: "layout-dashboard" as const, href: "/" },
  { id: "queue", label: "Approval queue", icon: "inbox" as const, href: "/", badge: n },
];

export default async function MemoStandalonePage({
  params,
  searchParams,
}: PageProps): Promise<JSX.Element> {
  const decoded = decodeURIComponent(params.id);
  const useMock = searchParams?.mock === "1";

  let state: Awaited<ReturnType<typeof getCase>> = null;
  let memo: Awaited<ReturnType<typeof getMemoArtifact>> = null;
  let queueLength = 0;
  try {
    [state, memo, queueLength] = await Promise.all([
      getCase(decoded),
      getMemoArtifact(decoded),
      getActiveCases(100).then((rows) => rows.length),
    ]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[memo-standalone] live load failed:", (e as Error).message);
  }

  if (!state && !useMock) notFound();

  const borrower =
    state?.borrower_name ??
    (useMock
      ? LECO_MEMO_FIXTURE.executive_summary.borrower_name
      : "Credit Memo");
  const appId = state?.application_id ?? decoded;
  const memoBody: Partial<CreditMemoBody> | null = useMock
    ? LECO_MEMO_FIXTURE
    : (memo as Partial<CreditMemoBody> | null);

  return (
    <AppShell
      brand="atrium"
      context="dev · us-central1"
      nav={navItems(queueLength)}
      active="queue"
    >
      <div className="flex items-center gap-4 border-b border-rule bg-paper px-6 py-3">
        <Button variant="ghost" size="sm" asChild>
          <Link
            href={`/cases/${encodeURIComponent(appId)}${useMock ? "?mock=1" : ""}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to case
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex-1 font-mono text-mono-sm text-ink-3">
          {appId} · Credit memo
        </div>
        <MemoExportButtons
          applicationId={appId}
          memo={memoBody}
          mock={useMock}
        />
        <Separator orientation="vertical" className="h-5" />
        <LiveStatus />
      </div>

      <header className="border-b border-rule bg-paper px-6 py-5">
        <p className="text-eyebrow uppercase tracking-[0.08em] text-accent-pressed font-mono">
          Confidential — Commercial Credit Memo
        </p>
        <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
          {borrower}
        </h1>
      </header>

      <main className="px-6 py-8">
        {memoBody && Object.keys(memoBody).length > 0 ? (
          <CreditMemoDocument applicationId={appId} memo={memoBody} />
        ) : (
          <div className="mx-auto max-w-3xl">
            <MemoEmpty />
          </div>
        )}
      </main>
    </AppShell>
  );
}
