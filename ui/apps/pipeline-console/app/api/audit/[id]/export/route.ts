/**
 * Regulator-shareable audit-trail export. Returns a single JSON document
 * containing the complete `application_state` row, the credit memo (if any),
 * the full `application_events` chain in chronological order, and the
 * aggregate roll-ups. The response advertises `Content-Disposition:
 * attachment` so the browser downloads it as a file.
 *
 * The content is intentionally an unredacted snapshot — downstream regulator
 * tooling does its own PII redaction. Inside the bank, access to this route
 * should be locked to the compliance role at the Cloud Run IAM layer.
 */

import { NextResponse } from "next/server";
import {
  getAuditTotals,
  getCase,
  getEventsForCase,
  getMemoArtifact,
} from "@uc/lib/live-data";
import {
  isDbConfigured,
  DB_UNAVAILABLE_MESSAGE,
} from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: DB_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }
  const id = decodeURIComponent(params.id);
  try {
    const state = await getCase(id);
    if (!state) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const [events, memo, totals] = await Promise.all([
      getEventsForCase(id),
      getMemoArtifact(id),
      getAuditTotals(id),
    ]);
    const body = {
      schema_version: "1.0",
      exported_at: new Date().toISOString(),
      application_state: state,
      credit_memo: memo,
      audit_trail: events,
      totals,
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="audit-${id}.json"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: DB_UNAVAILABLE_MESSAGE, detail: msg },
      { status: 503 },
    );
  }
}
