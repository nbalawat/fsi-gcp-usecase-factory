import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@fsi-bank/components";
import { Button } from "../../../components/ui/button";
import { Separator } from "../../../components/ui/separator";
import { LiveStatus } from "../../../components/live-status";
import { AuditTrail } from "@uc/components/agent-audit/audit-trail";
import { getActiveCases, getCase } from "@uc/lib/live-data";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

const navItems = (n: number) => [
  { id: "overview", label: "Pipeline overview", icon: "layout-dashboard" as const, href: "/" },
  { id: "queue", label: "Approval queue", icon: "inbox" as const, href: "/", badge: n },
];

/**
 * Top-level audit-trail route at /audit/<application_id>. Same content as the
 * underwriter-nested view but full-width and direct-shareable. The page
 * still renders when the DB is empty or unreachable; we just fall back to
 * the bare application id for the borrower display name.
 */
export default async function StandaloneAuditPage({
  params,
}: PageProps): Promise<JSX.Element> {
  const decoded = decodeURIComponent(params.id);

  let borrowerName: string | undefined;
  let queueCount = 0;
  try {
    const [state, total] = await Promise.all([
      getCase(decoded),
      getActiveCases(100).then((rows) => rows.length),
    ]);
    queueCount = total;
    borrowerName = state?.borrower_name;
  } catch {
    // DB unavailable — render with id only.
  }

  return (
    <AppShell
      brand="atrium"
      context="dev · us-central1"
      nav={navItems(queueCount)}
      active="queue"
    >
      <div className="flex items-center gap-4 border-b border-rule bg-paper px-6 py-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to queue
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex-1 font-mono text-mono-sm text-ink-3">
          {decoded} · standalone audit
        </div>
        <LiveStatus />
      </div>

      <main className="px-6 py-6">
        <AuditTrail
          applicationId={decoded}
          borrowerName={borrowerName ?? decoded}
          layout="page"
        />
      </main>
    </AppShell>
  );
}
