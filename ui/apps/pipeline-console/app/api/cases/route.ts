import { NextResponse } from "next/server";
import { DEFAULT_USE_CASE } from "../../../lib/load-console-config";
import { loadCases } from "../../../lib/load-demo-data";

export const dynamic = "force-dynamic";

/**
 * Mock BFF endpoint. Reads the demo-data scenarios from
 *   usecases/<uc>/demo-data/scenarios/*.json
 * and returns them as a flat list of CaseSummary records.
 *
 * In production this is replaced by a call to the BFF Cloud Run service,
 * which aggregates Cloud Workflows execution state + BigQuery audit tables.
 */
export async function GET(): Promise<Response> {
  const cases = loadCases(DEFAULT_USE_CASE);
  return NextResponse.json(
    cases.map((c) => ({
      loan_id: c.loan_id,
      borrower_id: c.borrower_id,
      borrower_name: c.borrower_name,
      loan_amount_usd: c.loan_amount_usd,
      naics_code: c.naics_code,
      stage: c.stage,
      risk_band: c.risk_band,
      dscr_base: c.dscr_base,
      dscr_stressed: c.dscr_stressed,
      single_borrower_pct: c.single_borrower_pct,
      stage_entered_at: c.stage_entered_at,
      regulatory_deadline_ts: c.regulatory_deadline_ts,
      alert: c.alert,
      confidence: c.agent_confidence,
    })),
    {
      // Mirror what an SSE-fronted BFF would do: short cache, recent shape
      headers: { "Cache-Control": "no-store" },
    },
  );
}
