import * as React from "react";
import { StatusBadge } from "@fsi-bank/components";
import type { ThresholdRow } from "../lib/data";
import { verdictBadge } from "../lib/data";
import { CitationChain } from "./CitationChain";

export interface ThresholdLedgerProps {
  rows: readonly ThresholdRow[];
}

/**
 * Threshold ledger — for each rule the GoRules engine evaluated, render
 * one row with: banker-readable label, the threshold value, the
 * effective-from date, the observed value, the verdict badge, and the
 * citation chain that authorizes the threshold. This is the canonical
 * regulator surface: an examiner walks down this table and can prove
 * every "watch" / "fail" the system flagged.
 *
 * Server component (display only).
 */
export const ThresholdLedger: React.FC<ThresholdLedgerProps> = ({ rows }) => (
  <section
    aria-label="Threshold ledger"
    className="rounded-md border border-rule bg-paper"
  >
    <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
      <div>
        <div className="eyebrow">Rules engine · Threshold ledger</div>
        <h3 className="font-serif text-h3 font-semi text-ink-1">
          Every threshold, with its citation chain
        </h3>
      </div>
      <span className="font-mono text-mono-sm text-ink-3">
        {rows.length} threshold{rows.length === 1 ? "" : "s"}
      </span>
    </header>
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-rule bg-paper-2 text-ink-3">
          <th scope="col" className="px-4 py-2 text-mono-sm font-medium uppercase tracking-wide">
            Threshold
          </th>
          <th scope="col" className="px-4 py-2 text-mono-sm font-medium uppercase tracking-wide">
            Required
          </th>
          <th scope="col" className="px-4 py-2 text-mono-sm font-medium uppercase tracking-wide">
            Observed
          </th>
          <th scope="col" className="px-4 py-2 text-mono-sm font-medium uppercase tracking-wide">
            Verdict
          </th>
          <th scope="col" className="px-4 py-2 text-mono-sm font-medium uppercase tracking-wide">
            Effective
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <React.Fragment key={r.id}>
            <tr className="border-b border-rule">
              <td className="px-4 py-3 align-top text-ui text-ink-1">
                <div className="font-medium">{r.label}</div>
                <div className="mt-1 font-mono text-mono-sm text-ink-3">
                  {r.id}
                </div>
              </td>
              <td className="px-4 py-3 align-top font-mono text-mono text-ink-1">
                {r.value}
              </td>
              <td className="px-4 py-3 align-top font-mono text-mono text-ink-1">
                {r.observed}
              </td>
              <td className="px-4 py-3 align-top">
                <StatusBadge kind={verdictBadge(r.verdict)}>
                  {r.verdict}
                </StatusBadge>
              </td>
              <td className="px-4 py-3 align-top font-mono text-mono-sm text-ink-3">
                {r.effectiveDate}
              </td>
            </tr>
            <tr className="border-b border-rule bg-paper-2">
              <td colSpan={5} className="px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="eyebrow">Authority</span>
                  <CitationChain citations={r.citations} showAuthority />
                </div>
              </td>
            </tr>
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </section>
);
