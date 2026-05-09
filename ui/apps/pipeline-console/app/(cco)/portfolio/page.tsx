import { AppShell } from "@fsi-bank/components";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { StatTile } from "../../../components/stat-tile";
import { PersonaTopbar } from "../../../components/persona-topbar";
import { ConcentrationHeatmap } from "@uc/components/cco/concentration-heatmap";
import { SingleBorrowerMeter } from "@uc/components/cco/single-borrower-meter";
import { RecentActivityFeed } from "@uc/components/cco/recent-activity";
import {
  buildConcentrationView,
  getPortfolioSnapshot,
  type PortfolioSnapshot,
} from "@uc/lib/portfolio-data";
import { getRecentPortfolioActivity } from "@uc/lib/watchlist-data";
import {
  PERSONA_COOKIE,
  parsePersonaCookie,
  personaNav,
} from "../../../lib/personas";

export const dynamic = "force-dynamic";

const fmtCompact = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const fmtFull = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "standard",
    maximumFractionDigits: 0,
  }).format(n);

const EMPTY_SNAPSHOT: PortfolioSnapshot = {
  totalCommitted: 0,
  totalOutstanding: 0,
  facilityCount: 0,
  borrowerCount: 0,
  watchlistCount: 0,
  watchlistCommitted: 0,
  ceclAllowance: 0,
  ceclProjected: 0,
  tier1Capital: 326_000_000,
  tier1HeadroomUsd: 326_000_000,
  tier1HeadroomPct: 100,
  borrowers: [],
};

export default async function PortfolioPage(): Promise<JSX.Element> {
  const persona = parsePersonaCookie(cookies().get(PERSONA_COOKIE)?.value);

  let snapshot = EMPTY_SNAPSHOT;
  let activity: Awaited<ReturnType<typeof getRecentPortfolioActivity>> = [];
  let loadFailed: string | null = null;
  try {
    [snapshot, activity] = await Promise.all([
      getPortfolioSnapshot(),
      getRecentPortfolioActivity(10),
    ]);
  } catch (e) {
    loadFailed = (e as Error).message;
    // eslint-disable-next-line no-console
    console.error("[cco/portfolio] live load failed:", loadFailed);
  }

  const view = buildConcentrationView(snapshot.borrowers);

  const hasData = snapshot.borrowerCount > 0;

  return (
    <AppShell
      brand="Commercial Credit"
      context="dev · us-central1"
      nav={personaNav(persona)}
      active="portfolio"
      avatar="JM"
    >
      <PersonaTopbar
        current={persona}
        left={
          <div className="flex items-center gap-2">
            <span className="font-mono text-mono-sm text-ink-3">
              Chief Credit Officer · Portfolio
            </span>
          </div>
        }
      />

      {/* Page header */}
      <header className="border-b border-rule bg-paper px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Commercial credit · enterprise view
            </p>
            <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
              Portfolio
            </h1>
            <p className="mt-1 text-body-sm text-ink-3">
              {hasData
                ? `${snapshot.borrowerCount} active borrowers · ${snapshot.facilityCount} facilities · ${fmtFull(snapshot.totalOutstanding)} outstanding`
                : "Tier 1 capital seeded; book the first facility to populate concentration."}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="Committed exposure"
            value={hasData ? fmtCompact(snapshot.totalCommitted) : "—"}
            sub={
              hasData
                ? `${snapshot.facilityCount} facilities · ${fmtCompact(snapshot.totalOutstanding)} drawn`
                : "Awaiting first booking"
            }
          />
          <StatTile
            label="Tier 1 headroom"
            value={`${snapshot.tier1HeadroomPct.toFixed(1)}%`}
            sub={`${fmtCompact(snapshot.tier1HeadroomUsd)} on ${fmtCompact(snapshot.tier1Capital)} Tier 1`}
            tone={
              snapshot.tier1HeadroomPct < 5
                ? "danger"
                : snapshot.tier1HeadroomPct < 15
                  ? "warning"
                  : "success"
            }
          />
          <StatTile
            label="Watchlist"
            value={snapshot.watchlistCount.toString()}
            sub={
              snapshot.watchlistCount > 0
                ? `${fmtCompact(snapshot.watchlistCommitted)} committed at risk`
                : "All borrowers in pass band"
            }
            tone={snapshot.watchlistCount === 0 ? "success" : "warning"}
          />
          <StatTile
            label="CECL allowance"
            value={fmtCompact(snapshot.ceclAllowance)}
            sub={`${fmtCompact(snapshot.ceclProjected)} projected · FY26 stress`}
          />
        </div>
      </header>

      {loadFailed && (
        <div className="mx-6 mt-6 rounded-md border border-semantic-danger/30 bg-semantic-dangerTint/20 p-4 text-body-sm text-ink-1">
          <p className="font-semi">Couldn&rsquo;t load portfolio data</p>
          <p className="mt-1 text-ink-2">{loadFailed}</p>
          <p className="mt-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/portfolio">Retry</Link>
            </Button>
          </p>
        </div>
      )}

      <main className="grid gap-6 px-6 py-6 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-end justify-between gap-3">
              <div>
                <CardTitle>Concentration heatmap</CardTitle>
                <CardDescription>
                  Each cell shows committed exposure to a sector × region
                  intersection as % of Tier 1. Click any cell to see the
                  borrowers behind it.
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/concentration">
                  Open detail view
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ConcentrationHeatmap view={view} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent decisions</CardTitle>
              <CardDescription>
                Last 10 underwriting decisions and downstream postings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecentActivityFeed rows={activity} />
            </CardContent>
          </Card>
        </div>
      </main>

      <section className="px-6 pb-10">
        <Card>
          <CardHeader>
            <div className="flex items-end justify-between gap-3">
              <div>
                <CardTitle>Single-borrower exposure</CardTitle>
                <CardDescription>
                  12 CFR 32 lending limit — top 5 borrowers as % of Tier 1
                  capital, with the {15}% ceiling marked.
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/watchlist">
                  Watchlist
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <SingleBorrowerMeter borrowers={snapshot.borrowers} />
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
