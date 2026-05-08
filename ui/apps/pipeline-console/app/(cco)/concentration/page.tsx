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
import { PersonaTopbar } from "../../../components/persona-topbar";
import { WhatIfPanel } from "@uc/components/cco/whatif-panel";
import {
  buildConcentrationView,
  getBorrowerExposures,
  type BorrowerExposure,
} from "@uc/lib/portfolio-data";
import {
  PERSONA_COOKIE,
  parsePersonaCookie,
  personaNav,
} from "../../../lib/personas";

export const dynamic = "force-dynamic";

export default async function ConcentrationPage(): Promise<JSX.Element> {
  const persona = parsePersonaCookie(cookies().get(PERSONA_COOKIE)?.value);

  let borrowers: BorrowerExposure[] = [];
  let error: string | null = null;
  try {
    borrowers = await getBorrowerExposures();
  } catch (e) {
    error = (e as Error).message;
    // eslint-disable-next-line no-console
    console.error("[cco/concentration] live load failed:", error);
  }

  const baseline = buildConcentrationView(borrowers);
  const hasData = borrowers.length > 0;

  return (
    <AppShell
      brand="atrium"
      context="dev · us-central1"
      nav={personaNav(persona)}
      active="concentration"
      avatar="JM"
    >
      <PersonaTopbar
        current={persona}
        left={
          <span className="font-mono text-mono-sm text-ink-3">
            Chief Credit Officer · Concentration
          </span>
        }
      />

      <header className="border-b border-rule bg-paper px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Sector × geography drilldown
            </p>
            <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
              Concentration
            </h1>
            <p className="mt-1 text-body-sm text-ink-3">
              {hasData
                ? `${borrowers.length} borrowers across ${baseline.sectors.length} sectors and ${baseline.regions.length} regions`
                : "No active borrowers — add facilities in the demo seed to populate this view"}
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portfolio">Back to portfolio</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-col gap-6 px-6 py-6">
        {error && (
          <div className="rounded-md border border-semantic-danger/30 bg-semantic-dangerTint/20 p-4 text-body-sm text-ink-1">
            <p className="font-semi">Couldn&rsquo;t load concentration data</p>
            <p className="mt-1 text-ink-2">{error}</p>
            <p className="mt-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/concentration">Retry</Link>
              </Button>
            </p>
          </div>
        )}

        {!hasData ? (
          <Card>
            <CardHeader>
              <CardTitle>No exposure to map yet</CardTitle>
              <CardDescription>
                Once borrowers are seeded into the master and facilities are
                booked, the heatmap and what-if simulator activate here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-body-sm text-ink-2">
                Run <span className="font-mono text-mono-sm">scripts/seed_borrowers.sh</span>{" "}
                from the repo root to populate Cloud SQL with the demo
                fixtures.
              </p>
            </CardContent>
          </Card>
        ) : (
          <WhatIfPanel baseline={baseline} borrowers={borrowers} />
        )}
      </main>
    </AppShell>
  );
}
