// rule-4.16-exception: print-clean view; spine excluded by design
import { notFound } from "next/navigation";
import {
  getCase,
  getMemoArtifact,
} from "@uc/lib/live-data";
import { MemoPrintView } from "@uc/components/credit-memo/memo-print-view";
import { LECO_MEMO_FIXTURE } from "@uc/lib/memo-fixtures";
import type { CreditMemoBody } from "@uc/components/credit-memo/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
  searchParams?: { mock?: string; auto?: string };
}

/**
 * Print-clean memo page. No AppShell, no nav, no buttons. Auto-fires
 * window.print() once mounted (set ?auto=0 to disable for snapshot tests).
 */
export default async function MemoPrintPage({
  params,
  searchParams,
}: PageProps): Promise<JSX.Element> {
  const decoded = decodeURIComponent(params.id);
  const useMock = searchParams?.mock === "1";
  const autoPrint = searchParams?.auto !== "0";

  let memo: Awaited<ReturnType<typeof getMemoArtifact>> = null;
  let appId = decoded;
  if (useMock) {
    memo = LECO_MEMO_FIXTURE as unknown as Awaited<
      ReturnType<typeof getMemoArtifact>
    >;
  } else {
    try {
      const [state, m] = await Promise.all([
        getCase(decoded),
        getMemoArtifact(decoded),
      ]);
      if (!state) notFound();
      appId = state.application_id;
      memo = m;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[memo-print] live load failed:", (e as Error).message);
    }
  }

  if (!memo) {
    return (
      <div className="memo-print-page mx-auto max-w-[760px] px-8 py-10">
        <h1 className="font-serif text-h1 font-semi text-ink-1">
          Credit memo not yet drafted
        </h1>
        <p className="mt-3 font-serif text-body text-ink-2">
          The memo will be available once the AI underwriter completes its
          analysis.
        </p>
      </div>
    );
  }

  return (
    <MemoPrintView
      applicationId={appId}
      memo={memo as Partial<CreditMemoBody>}
      autoPrint={autoPrint}
    />
  );
}
