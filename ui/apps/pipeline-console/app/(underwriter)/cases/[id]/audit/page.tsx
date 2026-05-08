import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@fsi-bank/components";
import { Button } from "../../../../../components/ui/button";
import { Separator } from "../../../../../components/ui/separator";
import { LiveStatus } from "../../../../../components/live-status";
import { AuditTrail } from "@uc/components/agent-audit/audit-trail";
import {
  getActiveCases,
  getCase,
} from "@uc/lib/live-data";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

const navItems = (n: number) => [
  { id: "overview", label: "Pipeline overview", icon: "layout-dashboard" as const, href: "/" },
  { id: "queue", label: "Approval queue", icon: "inbox" as const, href: "/", badge: n },
];

/**
 * Audit-trail page nested under the case detail route. Same content as the
 * top-level `/audit/<id>` page, just rendered with the underwriter's
 * standard chrome and a "back to memo" link.
 */
export default async function CaseAuditPage({
  params,
}: PageProps): Promise<JSX.Element> {
  const decoded = decodeURIComponent(params.id);

  let state: Awaited<ReturnType<typeof getCase>> = null;
  let queueLength = 0;
  try {
    [state, queueLength] = await Promise.all([
      getCase(decoded),
      getActiveCases(100).then((rows) => rows.length),
    ]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[case-audit] live load failed:", (e as Error).message);
  }
  if (!state) notFound();

  return (
    <AppShell
      brand="atrium"
      context="dev · us-central1"
      nav={navItems(queueLength)}
      active="queue"
    >
      <div className="flex items-center gap-4 border-b border-rule bg-paper px-6 py-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/cases/${encodeURIComponent(state.application_id)}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to credit memo
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex-1 font-mono text-mono-sm text-ink-3">
          {state.application_id} · agent audit
        </div>
        <LiveStatus />
      </div>

      <main className="px-6 py-6">
        <AuditTrail
          applicationId={state.application_id}
          borrowerName={state.borrower_name}
          layout="page"
        />
      </main>
    </AppShell>
  );
}
