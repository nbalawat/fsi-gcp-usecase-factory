import { AppShell } from "@fsi-bank/components";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { PersonaTopbar } from "../../../components/persona-topbar";
import {
  PERSONA_COOKIE,
  parsePersonaCookie,
  personaNav,
} from "../../../lib/personas";
import { getWatchlist, type WatchlistEntry } from "@uc/lib/watchlist-data";

export const dynamic = "force-dynamic";

const sevTone = (s: WatchlistEntry["severity"]) =>
  s === "high" ? "danger" : s === "medium" ? "warning" : "neutral";

const fmtRelative = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

export default async function WatchlistPage(): Promise<JSX.Element> {
  const persona = parsePersonaCookie(cookies().get(PERSONA_COOKIE)?.value);

  let entries: WatchlistEntry[] = [];
  let error: string | null = null;
  try {
    entries = await getWatchlist();
  } catch (e) {
    error = (e as Error).message;
    // eslint-disable-next-line no-console
    console.error("[cco/watchlist] live load failed:", error);
  }

  const counts = {
    high: entries.filter((e) => e.severity === "high").length,
    medium: entries.filter((e) => e.severity === "medium").length,
  };

  return (
    <AppShell
      brand="atrium"
      context="dev · us-central1"
      nav={personaNav(persona)}
      active="watchlist"
      avatar="JM"
    >
      <PersonaTopbar
        current={persona}
        left={
          <span className="font-mono text-mono-sm text-ink-3">
            Chief Credit Officer · Watchlist
          </span>
        }
      />

      <header className="border-b border-rule bg-paper px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Borrowers requiring attention
            </p>
            <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
              Watchlist
            </h1>
            <p className="mt-1 text-body-sm text-ink-3">
              {entries.length} concern{entries.length === 1 ? "" : "s"} flagged ·{" "}
              {counts.high} high · {counts.medium} medium
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portfolio">Back to portfolio</Link>
          </Button>
        </div>
      </header>

      <main className="px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-semantic-danger/30 bg-semantic-dangerTint/20 p-4 text-body-sm text-ink-1">
            <p className="font-semi">Couldn&rsquo;t build the watchlist</p>
            <p className="mt-1 text-ink-2">{error}</p>
            <p className="mt-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/watchlist">Retry</Link>
              </Button>
            </p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Auto-detected concerns</CardTitle>
            <CardDescription>
              Pulled from rating downgrades, DSCR slippage, covenant rule
              declines, and single-borrower concentration. Each row links to
              the underlying case or borrower folder.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {entries.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-body-sm font-semi text-ink-1">
                  Nothing on the watchlist
                </p>
                <p className="mt-1 text-body-sm text-ink-3">
                  Every borrower is in the pass band, every rule clean, every
                  exposure under the prudential line. We&rsquo;ll surface
                  anything that drifts here.
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse text-ui">
                <thead>
                  <tr className="border-y border-rule text-eyebrow uppercase tracking-[0.06em] text-ink-3">
                    <th className="px-5 py-2.5 text-left font-medium">Borrower</th>
                    <th className="px-5 py-2.5 text-left font-medium">Concern</th>
                    <th className="px-5 py-2.5 text-left font-medium">Severity</th>
                    <th className="px-5 py-2.5 text-left font-medium">Last activity</th>
                    <th className="px-5 py-2.5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr
                      key={e.key}
                      className="border-b border-rule transition hover:bg-paper-2"
                    >
                      <td className="px-5 py-3">
                        <p className="font-semi text-ink-1">{e.borrower_name}</p>
                        <p className="font-mono text-mono-sm text-ink-3">
                          {e.borrower_id}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-body-sm font-semi text-ink-1">
                          {e.concern}
                        </p>
                        <p className="text-body-sm text-ink-2">{e.detail}</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={sevTone(e.severity)} dot>
                          {e.severity}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 font-mono text-mono-sm text-ink-3">
                        {fmtRelative(e.last_activity_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {e.application_id ? (
                          <Button asChild variant="secondary" size="sm">
                            <Link
                              href={`/cases/${encodeURIComponent(e.application_id)}`}
                            >
                              Open case
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`mailto:cco@example.com?subject=Outreach: ${encodeURIComponent(e.borrower_name)}`}>
                              Schedule outreach
                            </Link>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
