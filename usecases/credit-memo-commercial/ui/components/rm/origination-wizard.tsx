"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BorrowerLookup, type BorrowerHit } from "./borrower-lookup";
import { PreScreenResult, type PrescreenView } from "./pre-screen-result";

const FACILITY_TYPES = [
  { id: "term_loan", label: "Term loan" },
  { id: "revolver", label: "Revolving credit" },
  { id: "line_of_credit", label: "Line of credit" },
  { id: "construction", label: "Construction" },
  { id: "mortgage", label: "Commercial mortgage" },
];

const fmtFullInput = (n: number): string =>
  Number.isFinite(n) && n > 0
    ? new Intl.NumberFormat("en-US").format(n)
    : "";

/**
 * RM origination wizard:
 *   1. Borrower lookup (autocomplete on borrower_master).
 *   2. Loan terms (amount, tenor, facility type).
 *   3. Pre-screen (Reg O · single-borrower · concentration), parallel.
 *   4. Continue → POSTs to /api/ingest-application; routes to underwriter case.
 */
export const OriginationWizard: React.FC = () => {
  const router = useRouter();
  const [borrower, setBorrower] = React.useState<BorrowerHit | null>(null);
  const [amountStr, setAmountStr] = React.useState<string>("");
  const [termYears, setTermYears] = React.useState<number>(5);
  const [facilityType, setFacilityType] = React.useState<string>("term_loan");
  const [view, setView] = React.useState<PrescreenView | null>(null);
  const [screening, setScreening] = React.useState(false);
  const [screenError, setScreenError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const amount = Number(amountStr.replace(/[^0-9.]/g, ""));
  const canScreen =
    borrower !== null &&
    Number.isFinite(amount) &&
    amount >= 100_000 &&
    termYears > 0 &&
    facilityType.length > 0;

  // Reset pre-screen if any input changes after a screen.
  React.useEffect(() => {
    setView(null);
    setSubmitError(null);
  }, [borrower, amountStr, termYears, facilityType]);

  const onScreen = async () => {
    if (!borrower) return;
    setScreenError(null);
    setScreening(true);
    try {
      const r = await fetch("/api/prescreen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          borrower_id: borrower.borrower_id,
          proposed_amount: amount,
          facility_type: facilityType,
          term_years: termYears,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setScreenError(data.error ?? `Pre-screen failed (HTTP ${r.status})`);
        setView(null);
      } else {
        setView(data.result as PrescreenView);
      }
    } catch (e) {
      setScreenError((e as Error).message);
      setView(null);
    } finally {
      setScreening(false);
    }
  };

  const onContinue = async () => {
    if (!borrower) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/ingest-application", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          borrower_id: borrower.borrower_id,
          borrower_name: borrower.legal_name,
          loan_amount_usd: amount,
          facility_type: facilityType,
          term_years: termYears,
          naics_code: borrower.naics_code,
          scenario_tag: "rm-origination",
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setSubmitError(data.error ?? `Submission failed (HTTP ${r.status})`);
      } else {
        router.push(`/cases/${encodeURIComponent(data.application_id)}`);
      }
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1 · Find the borrower</CardTitle>
          <CardDescription>
            Search the bank&rsquo;s borrower master. Atrium handles new entities
            through the customer-onboarding workflow — that&rsquo;s a separate
            track.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BorrowerLookup selected={borrower} onSelect={setBorrower} />
        </CardContent>
      </Card>

      {borrower && (
        <Card>
          <CardHeader>
            <CardTitle>2 · Structure the ask</CardTitle>
            <CardDescription>
              These three numbers feed the pre-screen and the credit memo
              draft. You can revise everything later before final submission.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
                  I want to lend
                </span>
                <div className="flex h-11 items-center rounded-md border border-rule bg-paper px-3 focus-within:border-accent">
                  <span className="font-mono text-mono-sm text-ink-3">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amountStr}
                    onChange={(e) =>
                      setAmountStr(
                        e.target.value.replace(/[^0-9]/g, "").replace(/^0+/, ""),
                      )
                    }
                    onBlur={() => {
                      const n = Number(amountStr.replace(/[^0-9.]/g, ""));
                      if (Number.isFinite(n) && n > 0) {
                        setAmountStr(fmtFullInput(n));
                      }
                    }}
                    placeholder="8,000,000"
                    aria-label="Proposed loan amount in USD"
                    className="ml-2 w-44 bg-transparent font-mono tabular-nums text-ink-1 placeholder:text-ink-3 focus:outline-none"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
                  for
                </span>
                <div className="flex h-11 items-center gap-2 rounded-md border border-rule bg-paper px-3 focus-within:border-accent">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={termYears}
                    onChange={(e) => setTermYears(Number(e.target.value))}
                    aria-label="Term in years"
                    className="w-12 bg-transparent font-mono tabular-nums text-ink-1 focus:outline-none"
                  />
                  <span className="text-body-sm text-ink-3">years</span>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
                  Facility type
                </span>
                <select
                  value={facilityType}
                  onChange={(e) => setFacilityType(e.target.value)}
                  className="h-11 min-w-[200px] rounded-md border border-rule bg-paper px-3 text-body-sm text-ink-1 focus:border-accent focus:outline-none"
                >
                  {FACILITY_TYPES.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={onScreen}
                disabled={!canScreen || screening}
                className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-body-sm font-medium text-accent-fg transition hover:bg-accent-hov active:bg-accent-pressed disabled:cursor-not-allowed disabled:opacity-50"
              >
                {screening ? "Running pre-screen…" : "Run pre-screen"}
              </button>
            </div>
            {screenError && (
              <p className="mt-3 text-body-sm text-semantic-danger">
                {screenError}
              </p>
            )}
            {!canScreen && borrower && (
              <p className="mt-3 text-body-sm text-ink-3">
                Enter a loan amount of at least $100,000 to run the pre-screen.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {view && (
        <Card>
          <CardHeader>
            <CardTitle>3 · Pre-screen</CardTitle>
            <CardDescription>
              Three checks run in parallel: Reg O insider screening,
              12 CFR 32 single-borrower limit, and bank concentration appetite.
              Cleared in under two seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PreScreenResult
              view={view}
              onContinue={onContinue}
              submitting={submitting}
              submitError={submitError}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
