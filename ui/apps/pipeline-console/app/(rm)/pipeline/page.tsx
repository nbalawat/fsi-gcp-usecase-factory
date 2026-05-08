import { AppShell } from "@fsi-bank/components";
import { cookies } from "next/headers";
import Link from "next/link";
import { Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { PersonaTopbar } from "../../../components/persona-topbar";
import { CaseRow } from "../../cases/case-row";
import { getActiveCases, toCaseRecord } from "@uc/lib/live-data";
import type { CaseRecord } from "@uc/lib/types";
import {
  PERSONA_COOKIE,
  parsePersonaCookie,
  personaNav,
} from "../../../lib/personas";

export const dynamic = "force-dynamic";

const fmtUsd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const stageLabel: Record<string, string> = {
  intake: "Intake",
  spreading: "Spreading",
  scoring: "Policy & limits",
  underwrite: "Memo drafting",
  approval: "Awaiting decision",
  decision: "Decision made",
  posting: "Posting",
  done: "Closed",
};

const STAGES = [
  "intake",
  "spreading",
  "scoring",
  "underwrite",
  "approval",
  "decision",
  "posting",
  "done",
];

const stageIndex = (s: string) => {
  const i = STAGES.indexOf(s);
  return i >= 0 ? i : 0;
};

export default async function RmPipelinePage(): Promise<JSX.Element> {
  const persona = parsePersonaCookie(cookies().get(PERSONA_COOKIE)?.value);

  let cases: CaseRecord[] = [];
  let error: string | null = null;
  try {
    const states = await getActiveCases(100);
    cases = states.map((s) => toCaseRecord(s));
  } catch (e) {
    error = (e as Error).message;
    // eslint-disable-next-line no-console
    console.error("[rm/pipeline] live load failed:", error);
  }

  // Group by stage for the rolled-up totals.
  const totalCommitted = cases.reduce((s, c) => s + c.loan_amount_usd, 0);

  return (
    <AppShell
      brand="atrium"
      context="dev · us-central1"
      nav={personaNav(persona)}
      active="pipeline"
      avatar="AS"
    >
      <PersonaTopbar
        current={persona}
        left={
          <span className="font-mono text-mono-sm text-ink-3">
            Relationship Manager · My pipeline
          </span>
        }
      />

      <header className="border-b border-rule bg-paper px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              In-flight deals you originated
            </p>
            <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
              My pipeline
            </h1>
            <p className="mt-1 text-body-sm text-ink-3">
              {cases.length} application{cases.length === 1 ? "" : "s"} ·{" "}
              {fmtUsd(totalCommitted)} requested
            </p>
          </div>
          <Button asChild variant="primary" size="sm">
            <Link href="/origination">Start a new application</Link>
          </Button>
        </div>
      </header>

      <main className="px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-semantic-danger/30 bg-semantic-dangerTint/20 p-4 text-body-sm text-ink-1">
            <p className="font-semi">Couldn&rsquo;t load your pipeline</p>
            <p className="mt-1 text-ink-2">{error}</p>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Stage breakdown</CardTitle>
            <CardDescription>
              Each row is a deal you started. The bar shows where it sits
              between intake and posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {cases.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-body-sm font-semi text-ink-1">
                  No applications in flight
                </p>
                <p className="mt-1 text-body-sm text-ink-3">
                  Start a new origination from the My origination tab. As soon
                  as the pre-screen clears, the case lands here and the
                  underwriting queue picks it up.
                </p>
                <p className="mt-4">
                  <Button asChild variant="primary" size="sm">
                    <Link href="/origination">Start an application</Link>
                  </Button>
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse text-ui">
                <thead>
                  <tr className="border-y border-rule text-eyebrow uppercase tracking-[0.06em] text-ink-3">
                    <th className="px-5 py-2.5 text-left font-medium">Borrower</th>
                    <th className="px-5 py-2.5 text-left font-medium">Amount</th>
                    <th className="px-5 py-2.5 text-left font-medium">Stage</th>
                    <th className="px-5 py-2.5 text-left font-medium">Progress</th>
                    <th className="px-5 py-2.5 text-left font-medium">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => {
                    const idx = stageIndex(c.stage);
                    const pct = ((idx + 1) / STAGES.length) * 100;
                    const sinceMs =
                      Date.now() - new Date(c.stage_entered_at).getTime();
                    const sinceLabel =
                      sinceMs < 3_600_000
                        ? `${Math.max(1, Math.floor(sinceMs / 60_000))}m ago`
                        : sinceMs < 86_400_000
                          ? `${Math.floor(sinceMs / 3_600_000)}h ago`
                          : `${Math.floor(sinceMs / 86_400_000)}d ago`;
                    return (
                      <CaseRow
                        key={c.loan_id}
                        href={`/cases/${encodeURIComponent(c.loan_id)}`}
                      >
                        <td className="px-5 py-3">
                          <div className="font-semi text-ink-1">
                            {c.borrower_name}
                          </div>
                          <div className="font-mono text-mono-sm text-ink-3">
                            {c.naics_code ? `NAICS ${c.naics_code}` : c.borrower_id}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-semi tabular-nums text-ink-1">
                          {fmtUsd(c.loan_amount_usd)}
                        </td>
                        <td className="px-5 py-3 text-ink-2">
                          {stageLabel[c.stage] ?? c.stage}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="relative h-2 w-32 overflow-hidden rounded-full bg-paper-2">
                              <span
                                className={
                                  "absolute left-0 top-0 h-full " +
                                  (c.stuck
                                    ? "bg-semantic-danger"
                                    : "bg-accent")
                                }
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="font-mono text-mono-sm text-ink-3 tabular-nums">
                              {idx + 1}/{STAGES.length}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={c.stuck ? "danger" : "neutral"}>
                            <Clock className="h-3 w-3" />
                            {sinceLabel}
                          </Badge>
                        </td>
                      </CaseRow>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
