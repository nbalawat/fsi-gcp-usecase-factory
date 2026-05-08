"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BorrowerExposure, ConcentrationView } from "../../lib/portfolio-data";
import { ConcentrationHeatmap } from "./concentration-heatmap";
import { SingleBorrowerMeter } from "./single-borrower-meter";

interface Props {
  baseline: ConcentrationView;
  borrowers: BorrowerExposure[];
}

const fmtFull = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "standard",
    maximumFractionDigits: 0,
  }).format(n);

interface SimResponse {
  ok: boolean;
  borrower?: BorrowerExposure;
  view?: ConcentrationView;
  delta?: { sectorPct: number; borrowerPct: number };
  error?: string;
}

/**
 * What-if simulator for the CCO concentration page. Lets the officer pick
 * a borrower, type a proposed loan amount, and instantly see the heatmap +
 * single-borrower meter re-render against the simulated state. Strictly
 * read-only — calls POST /api/concentration which returns a preview only.
 */
export const WhatIfPanel: React.FC<Props> = ({ baseline, borrowers }) => {
  const [borrowerId, setBorrowerId] = React.useState<string>(
    borrowers[0]?.borrower_id ?? "",
  );
  const [amountStr, setAmountStr] = React.useState<string>("5000000");
  const [pending, setPending] = React.useState(false);
  const [sim, setSim] = React.useState<SimResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const onSimulate = async () => {
    setError(null);
    setPending(true);
    try {
      const r = await fetch("/api/concentration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          borrower_id: borrowerId,
          proposed_amount_usd: Number(amountStr),
        }),
      });
      const data = (await r.json()) as SimResponse;
      if (!r.ok || !data.ok) {
        setError(data.error ?? `Simulation failed (HTTP ${r.status})`);
        setSim(null);
      } else {
        setSim(data);
      }
    } catch (e) {
      setError((e as Error).message);
      setSim(null);
    } finally {
      setPending(false);
    }
  };

  const onReset = () => {
    setSim(null);
    setError(null);
  };

  const view = sim?.view ?? baseline;
  const proposed = sim
    ? { borrower_id: borrowerId, amount_usd: Number(amountStr) }
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>What if?</CardTitle>
        <CardDescription>
          Propose a new commitment to an existing borrower and preview its
          impact on the concentration heatmap and single-borrower meter. No
          data is written; this is a what-if only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Borrower
            </span>
            <select
              value={borrowerId}
              onChange={(e) => setBorrowerId(e.target.value)}
              className="h-9 min-w-[220px] rounded-md border border-rule bg-paper px-2 text-body-sm text-ink-1 focus:border-accent focus:outline-none"
            >
              {borrowers.map((b) => (
                <option key={b.borrower_id} value={b.borrower_id}>
                  {b.legal_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              New commitment (USD)
            </span>
            <input
              type="number"
              min={0}
              step={100000}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="h-9 w-44 rounded-md border border-rule bg-paper px-2 font-mono text-mono-sm text-ink-1 focus:border-accent focus:outline-none"
              aria-label="New commitment amount in USD"
            />
          </label>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onSimulate}
            disabled={pending || !borrowerId || !Number(amountStr)}
          >
            {pending ? "Simulating…" : "Preview impact"}
          </Button>
          {sim && (
            <Button type="button" variant="ghost" size="md" onClick={onReset}>
              Reset
            </Button>
          )}
        </div>

        {error && (
          <p className="mt-3 text-body-sm text-semantic-danger">{error}</p>
        )}

        {sim && sim.delta && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-body-sm">
            <Badge tone={sim.delta.borrowerPct > 15 ? "danger" : sim.delta.borrowerPct > 10 ? "warning" : "success"} dot>
              Borrower exposure → {sim.delta.borrowerPct.toFixed(2)}% of Tier 1
            </Badge>
            <Badge tone={sim.delta.sectorPct > 10 ? "danger" : sim.delta.sectorPct > 7 ? "warning" : "neutral"} dot>
              Sector cell → {sim.delta.sectorPct.toFixed(2)}% of Tier 1
            </Badge>
            {sim.borrower && (
              <span className="font-mono text-mono-sm text-ink-3">
                Adding {fmtFull(Number(amountStr))} to {sim.borrower.legal_name}
              </span>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-6">
          <div>
            <p className="mb-3 text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              {sim ? "Simulated heatmap" : "Current heatmap"}
            </p>
            <ConcentrationHeatmap view={view} variant="detail" />
          </div>
          <div>
            <p className="mb-3 text-eyebrow uppercase tracking-[0.06em] text-ink-3">
              Single-borrower meter
            </p>
            <SingleBorrowerMeter borrowers={borrowers} proposed={proposed} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
