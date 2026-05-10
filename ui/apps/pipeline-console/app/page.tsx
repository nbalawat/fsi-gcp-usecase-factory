import { AppShell } from "@fsi-bank/components";
import { cookies } from "next/headers";
import { ChevronRight, AlertTriangle, Clock } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { LiveStatus } from "../components/live-status";
import { LiveQueueTable } from "@uc/components/live-queue-table";
import { PersonaSwitcher } from "../components/persona-switcher";
import { MultiDocUpload } from "@uc/components/document-upload/multi-doc-upload";
import { getActiveCases, toCaseRecord } from "@uc/lib/live-data";
import type { CaseRecord } from "@uc/lib/types";
import { PERSONA_COOKIE, parsePersonaCookie, personaNav } from "../lib/personas";

export const dynamic = "force-dynamic";

const fmtUsd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const decisionTone = (d: string) =>
  d === "APPROVE"
    ? ("success" as const)
    : d === "DECLINE" || d === "STALLED"
      ? ("danger" as const)
      : ("warning" as const);

const decisionLabel = (d: string) =>
  d === "RETURN_FOR_REVISION"
    ? "Return"
    : d === "APPROVE"
      ? "Approve"
      : d === "DECLINE"
        ? "Decline"
        : d === "STALLED"
          ? "Blocked"
          : d;

const riskTone = (b: string | null | undefined) => {
  const v = String(b ?? "");
  if (v.startsWith("1")) return "success" as const;
  if (v.startsWith("2") || v.startsWith("3")) return "warning" as const;
  if (v.startsWith("4") || v.startsWith("5")) return "danger" as const;
  return "neutral" as const;
};

const stageLabel: Record<string, string> = {
  intake: "Application received",
  spreading: "Spreading financials",
  scoring: "Policy & limits",
  underwrite: "Drafting memo",
  approval: "Awaiting your decision",
  decision: "Decision made",
  posting: "Posting to GL",
  done: "Closed",
};

export default async function HomePage(): Promise<JSX.Element> {
  const persona = parsePersonaCookie(cookies().get(PERSONA_COOKIE)?.value);
  // Live read from Cloud SQL. With an empty DB this returns [] and the page
  // renders an empty-queue state. The /api/cases route returns 503 with a
  // helpful message if the DB is unreachable; the homepage degrades to []
  // here so the dev server keeps booting.
  let states: Awaited<ReturnType<typeof getActiveCases>> = [];
  try {
    states = await getActiveCases(100);
  } catch (e) {
    // Surfaced via LiveStatus header strip; render empty queue here.
    // eslint-disable-next-line no-console
    console.error("[home] getActiveCases failed:", (e as Error).message);
  }
  const cases: CaseRecord[] = states.map((s) => toCaseRecord(s));

  const stuck = cases.filter((c) => c.stuck);
  const awaitingDecision = cases.filter((c) => c.stage === "approval");

  const earliestDeadline = cases
    .map((c) => new Date(c.regulatory_deadline_ts).getTime() - Date.now())
    .filter((ms) => !isNaN(ms))
    .sort((a, b) => a - b)[0];
  const hoursToDeadline = earliestDeadline
    ? Math.max(0, earliestDeadline / (1000 * 60 * 60))
    : 0;

  const totalValue = cases.reduce((s, c) => s + c.loan_amount_usd, 0);
  const avgDscr =
    cases
      .map((c) => c.dscr_base)
      .filter((d): d is number => d !== undefined)
      .reduce((s, v, _i, arr) => s + v / arr.length, 0) || 0;

  return (
    <AppShell
      brand="Commercial Credit"
      context="dev · us-central1"
      nav={personaNav(persona, cases.length)}
      active="queue"
    >
      {/* ── Page header ─────────────────────────────────────────── */}
      <header className="border-b border-rule bg-paper px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Credit operations · commercial loans
            </p>
            <h1 className="mt-1 font-serif text-h1 font-semi tracking-tight text-ink-1">
              Approval queue
            </h1>
            <p className="mt-1 text-body-sm text-ink-3">
              {cases.length} commercial loan applications in flight ·{" "}
              {awaitingDecision.length} awaiting your decision ·{" "}
              {stuck.length > 0
                ? `${stuck.length} blocked`
                : "none blocked"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LiveStatus />
            <PersonaSwitcher current={persona} />
          </div>
        </div>

        {/* Headline stats — banker terms */}
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="Awaiting decision"
            value={awaitingDecision.length.toString()}
            sub={
              awaitingDecision.length > 0
                ? `${fmtUsd(awaitingDecision.reduce((s, c) => s + c.loan_amount_usd, 0))} total`
                : "Queue clear"
            }
            tone={awaitingDecision.length > 0 ? "accent" : "neutral"}
          />
          <StatTile
            label="In-flight value"
            value={fmtUsd(totalValue)}
            sub={`${cases.length} applications`}
          />
          <StatTile
            label="Average DSCR"
            value={avgDscr > 0 ? `${avgDscr.toFixed(2)}x` : "—"}
            sub="Cohort median 1.32x"
            tone={avgDscr < 1.2 ? "danger" : "success"}
          />
          <StatTile
            label="Earliest deadline"
            value={
              hoursToDeadline < 1
                ? "<1h"
                : hoursToDeadline < 24
                  ? `${hoursToDeadline.toFixed(0)}h`
                  : `${(hoursToDeadline / 24).toFixed(1)}d`
            }
            sub="OCC 5-business-day"
            tone={
              hoursToDeadline < 8
                ? "danger"
                : hoursToDeadline < 24
                  ? "warning"
                  : "success"
            }
          />
        </div>
      </header>

      {/* ── Stuck banner (if any) ──────────────────────────────── */}
      {stuck.length > 0 && (
        <div className="mx-6 mt-6 flex items-start gap-3 rounded-md border border-semantic-danger/30 bg-semantic-dangerTint/30 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-semantic-danger" />
          <div className="flex-1">
            <p className="text-body-sm font-semi text-ink-1">
              {stuck.length} application{stuck.length === 1 ? "" : "s"} blocked
            </p>
            <ul className="mt-1 text-body-sm text-ink-2">
              {stuck.map((c) => (
                <li key={c.loan_id}>
                  <Link
                    href={`/cases/${encodeURIComponent(c.loan_id)}`}
                    className="text-accent-pressed hover:underline"
                  >
                    {c.borrower_name}
                  </Link>{" "}
                  — {c.alert ?? "Past SLA"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Multi-document upload (hero) ───────────────────────── */}
      <section className="px-6 pt-6">
        <Card className="border-accent/30 bg-paper">
          <CardHeader>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <CardTitle>Start a new application</CardTitle>
                <CardDescription>
                  Upload the full document set — 10-K + 10-Q + AR aging + board
                  minutes as needed. Cloud Workflows extracts each PDF in
                  parallel via Landing AI, then pauses at four checkpoints
                  (extraction review, rating review, draft review, final
                  approval) for your decision.
                </CardDescription>
              </div>
              <Badge tone="accent" dot>
                Workflows v3 · HITL
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <MultiDocUpload />
          </CardContent>
        </Card>
      </section>

      {/* ── Cases table ────────────────────────────────────────── */}
      <main className="px-6 py-6">
        <Card>
          <CardHeader>
            <div className="flex items-end justify-between gap-4">
              <div>
                <CardTitle>All in-flight applications</CardTitle>
                <CardDescription>
                  Click any row to open the full credit memo.
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/api/cases" target="_blank">
                  View raw data
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <LiveQueueTable initialCases={states} />
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

const StatTile: React.FC<{
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "warning" | "danger" | "accent" | "neutral";
}> = ({ label, value, sub, tone = "neutral" }) => {
  const valueClass =
    tone === "danger"
      ? "text-semantic-danger"
      : tone === "warning"
        ? "text-semantic-warning"
        : tone === "success"
          ? "text-semantic-success"
          : tone === "accent"
            ? "text-accent-pressed"
            : "text-ink-1";
  return (
    <div className="rounded-md border border-rule bg-paper p-4">
      <p className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
        {label}
      </p>
      <p
        className={`mt-1 font-serif text-h2 font-semi tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-mono-sm font-mono text-ink-3">{sub}</p>}
    </div>
  );
};

const CaseRowDisplay: React.FC<{ c: CaseRecord }> = ({ c }) => {
  const hRemain = Math.max(
    0,
    (new Date(c.regulatory_deadline_ts).getTime() - Date.now()) / (1000 * 60 * 60),
  );
  return (
    <CaseRow href={`/cases/${encodeURIComponent(c.loan_id)}`}>
      <td className="px-5 py-3">
        <div className="font-semi text-ink-1">{c.borrower_name}</div>
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
        <Badge tone={riskTone(c.risk_band)} dot>
          {c.risk_band.replace(/^(\d)-(.+)$/, "$1 · $2")}
        </Badge>
      </td>
      <td className="px-5 py-3 font-mono tabular-nums text-ink-2">
        {c.dscr_base !== undefined ? `${c.dscr_base.toFixed(2)}x` : "—"}
      </td>
      <td className="px-5 py-3">
        <Badge tone={decisionTone(c.decision)} dot>
          {decisionLabel(c.decision)}
        </Badge>
      </td>
      <td className="px-5 py-3">
        <Badge
          tone={
            hRemain < 8 || c.stuck
              ? "danger"
              : hRemain < 24
                ? "warning"
                : "neutral"
          }
        >
          <Clock className="h-3 w-3" />
          {hRemain < 1
            ? "<1h"
            : hRemain < 24
              ? `${hRemain.toFixed(0)}h`
              : `${(hRemain / 24).toFixed(1)}d`}
        </Badge>
      </td>
    </CaseRow>
  );
};
