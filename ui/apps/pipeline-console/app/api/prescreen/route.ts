import { NextResponse } from "next/server";
import { prescreenBorrower, type PrescreenInput } from "@uc/lib/rm-data";
import { isDbConfigured, DB_UNAVAILABLE_MESSAGE } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Three-check pre-screen. In production this fans out to the deployed
 * `insider-screening` and `exposure-aggregator` Cloud Run services via OIDC;
 * for the demo we run the same SQL the services would run, against the same
 * Cloud SQL instance, so the result shape is wire-identical.
 *
 * The handler completes in well under 2s on the demo dataset.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }
  let body: Partial<PrescreenInput>;
  try {
    body = (await req.json()) as Partial<PrescreenInput>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body must be JSON" },
      { status: 400 },
    );
  }
  if (!body.borrower_id || typeof body.borrower_id !== "string") {
    return NextResponse.json(
      { ok: false, error: "borrower_id required" },
      { status: 400 },
    );
  }
  const proposed = Number(body.proposed_amount ?? 0);
  if (!Number.isFinite(proposed) || proposed <= 0) {
    return NextResponse.json(
      { ok: false, error: "proposed_amount must be a positive number" },
      { status: 400 },
    );
  }
  const term = Number(body.term_years ?? 5);
  const facilityType = String(body.facility_type ?? "term_loan");
  try {
    const result = await prescreenBorrower({
      borrower_id: body.borrower_id,
      proposed_amount: proposed,
      facility_type: facilityType,
      term_years: term,
    });
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 400 },
    );
  }
}
