import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPool } from "../../../lib/db";
import { isDbConfigured, DB_UNAVAILABLE_MESSAGE } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Application ingest. In production this publishes to the
 * `loans.application.submitted` Pub/Sub topic; the handler service pulls the
 * event, normalises it, and writes the first `application_state` row.
 *
 * For the demo we publish-by-proxy: write the same row directly so the
 * underwriter queue picks it up within the next SSE tick (typically ~1s).
 * The shape matches the orchestrator contract so the swap to Pub/Sub is one
 * environment variable.
 */
interface IngestBody {
  borrower_id?: string;
  borrower_name?: string;
  loan_amount_usd?: number;
  facility_type?: string;
  term_years?: number;
  naics_code?: string;
  /** Optional scenario tag (e.g. "rm-origination") for traceability. */
  scenario_tag?: string;
}

export async function POST(req: Request): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: DB_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }
  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body must be JSON" },
      { status: 400 },
    );
  }
  if (!body.borrower_id || !body.borrower_name || !body.loan_amount_usd) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "borrower_id, borrower_name, and loan_amount_usd are required to start an application",
      },
      { status: 400 },
    );
  }

  const applicationId = randomUUID();
  const pool = getPool();
  try {
    // Insert minimal application_state row + intake event. The orchestrator
    // and atomic services will update further fields as the application
    // moves through the pipeline.
    await pool.query("BEGIN");
    await pool.query(
      `INSERT INTO application_state (
         application_id, borrower_id, borrower_name, naics_code,
         loan_amount_usd, scenario_tag, current_stage, clock_started_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'intake', NOW())`,
      [
        applicationId,
        body.borrower_id,
        body.borrower_name,
        body.naics_code ?? null,
        body.loan_amount_usd,
        body.scenario_tag ?? "rm-origination",
      ],
    );
    await pool.query(
      `INSERT INTO application_events (application_id, event_type, service_name, payload)
       VALUES ($1, 'stage_entered', NULL, $2::jsonb)`,
      [
        applicationId,
        JSON.stringify({
          stage: "intake",
          source: "rm-origination",
          facility_type: body.facility_type ?? "term_loan",
          term_years: body.term_years ?? 5,
        }),
      ],
    );
    await pool.query("COMMIT");
    return NextResponse.json({
      ok: true,
      application_id: applicationId,
      next_stage: "spreading",
      message:
        "Application accepted. The underwriter queue will pick this up momentarily.",
    });
  } catch (e) {
    await pool.query("ROLLBACK").catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}
