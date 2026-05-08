/**
 * Live BFF endpoint — reads `application_state` from Cloud SQL and returns a
 * trimmed list shape the UI can consume directly.
 *
 * Replaces the demo-data JSON loader. With an empty DB the response is an
 * empty array and the homepage renders its empty-queue state.
 */

import { NextResponse } from "next/server";
import { getActiveCases } from "@uc/lib/live-data";
import { isDbConfigured, DB_UNAVAILABLE_MESSAGE } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: DB_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const cases = await getActiveCases(100);
    return NextResponse.json(
      cases.map((c) => ({
        loan_id: c.application_id,
        application_id: c.application_id,
        borrower_id: c.borrower_id,
        borrower_name: c.borrower_name,
        loan_amount_usd: c.loan_amount_usd,
        naics_code: c.naics_code,
        stage: c.current_stage,
        risk_band: c.risk_band,
        decision: c.decision,
        dscr_base: c.dscr_base,
        dscr_stressed: c.dscr_stressed,
        single_borrower_pct: c.single_borrower_pct,
        stage_entered_at: c.last_event_at,
        regulatory_deadline_ts: c.regulatory_deadline,
        clock_started_at: c.clock_started_at,
        alert: c.alert,
        confidence: c.agent_confidence,
        stuck: c.stuck,
        updated_at: c.updated_at,
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: DB_UNAVAILABLE_MESSAGE, detail: msg },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
